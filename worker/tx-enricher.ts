import { Connection, PublicKey } from "@solana/web3.js";
import { createLogger } from "@/lib/logger";
import { UNENRICHABLE_SENTINEL } from "@/lib/indexer/sdk-adapter";
import { sleep } from "./utils";
import type { Network } from "@/types";

const log = createLogger("tx-enricher");

// Error code 6204 = AlreadyCallbackedComputation (duplicate retry, not a real failure)
const ALREADY_CALLBACKED_CODE = 6204;

async function getDb() {
  const { db } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  return { db, schema };
}

/**
 * Extract Arcium custom error code from a Solana TransactionError.
 * Arcium errors appear as: { InstructionError: [index, { Custom: code }] }
 */
function extractCustomErrorCode(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const obj = err as Record<string, unknown>;
  const ie = obj.InstructionError;
  if (!Array.isArray(ie) || ie.length < 2) return null;
  const detail = ie[1];
  if (detail && typeof detail === "object" && "Custom" in (detail as Record<string, unknown>)) {
    const code = (detail as Record<string, number>).Custom;
    return typeof code === "number" ? code : null;
  }
  return null;
}

export interface TxEnricherConfig {
  rpcUrl: string;
  network: Network;
  batchSize?: number;
  intervalMs?: number;
  rateLimitMs?: number;
  initialDelayMs?: number;
}

// Max consecutive failures before marking a row as unenrichable
const MAX_ENRICH_FAILURES = 3;

export class TxEnricher {
  private connection: Connection;
  private network: Network;
  private batchSize: number;
  private intervalMs: number;
  private rateLimitMs: number;
  private initialDelayMs: number;
  private running = false;
  private failureCounts = new Map<string, number>();

  constructor(config: TxEnricherConfig) {
    this.connection = new Connection(config.rpcUrl, { commitment: "confirmed" });
    this.network = config.network;
    this.batchSize = config.batchSize ?? 50;
    this.intervalMs = config.intervalMs ?? 60_000;
    this.rateLimitMs = config.rateLimitMs ?? 100;
    this.initialDelayMs = config.initialDelayMs ?? 15_000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    log.info("TX enricher started", {
      network: this.network,
      batchSize: this.batchSize,
      intervalMs: this.intervalMs,
      rateLimitMs: this.rateLimitMs,
      initialDelayMs: this.initialDelayMs,
    });

    // Short initial delay: let indexing populate computations first
    setTimeout(() => {
      if (this.running) this.enrichLoop();
    }, this.initialDelayMs);
  }

  /**
   * Continuous enrichment loop: process batches back-to-back until caught up,
   * then idle for intervalMs before checking again. This means after downtime
   * or a backlog, we catch up in minutes instead of hours.
   */
  private async enrichLoop(): Promise<void> {
    while (this.running) {
      try {
        const batchCount = await this.enrichBatch();

        if (batchCount >= this.batchSize) {
          // Full batch — likely more work available, continue immediately
          log.debug("Batch full, continuing immediately", {
            network: this.network,
            batchCount,
          });
          continue;
        }

        // Caught up — wait before checking again
        await sleep(this.intervalMs);
      } catch (err) {
        log.error("Enrichment cycle failed", {
          network: this.network,
          error: err instanceof Error ? err.message : String(err),
        });
        // Back off on error
        await sleep(this.intervalMs);
      }
    }
  }

  /**
   * Process a single batch of computations needing enrichment.
   * Returns the number of rows in the batch (used to decide whether to continue immediately).
   */
  private async enrichBatch(): Promise<number> {
    const { db, schema } = await getDb();
    const { eq, and, or, isNull, isNotNull, desc, ne } = await import("drizzle-orm");

    // Find computations needing enrichment:
    // 1. Missing queueTxSig (need to find queue tx)
    // 2. Finalized but missing finalizeTxSig (need to find callback tx)
    // 3. Has finalizeTxSig but callbackErrorCode not yet checked (need error extraction)
    // 4. Queued with queueTxSig set but no finalizeTxSig — may be stale (finalized on-chain
    //    but WS/polling missed the update)
    // 5. Missing queuedAt (backfill on-chain timestamp)
    const rows = await db
      .select({
        id: schema.computations.id,
        address: schema.computations.address,
        status: schema.computations.status,
        queueTxSig: schema.computations.queueTxSig,
        queuedAt: schema.computations.queuedAt,
        finalizeTxSig: schema.computations.finalizeTxSig,
        callbackErrorCode: schema.computations.callbackErrorCode,
      })
      .from(schema.computations)
      .where(
        and(
          eq(schema.computations.network, this.network),
          eq(schema.computations.isScaffold, false),
          // Exclude rows permanently marked as unenrichable
          or(isNull(schema.computations.callbackErrorCode), ne(schema.computations.callbackErrorCode, UNENRICHABLE_SENTINEL)),
          or(
            isNull(schema.computations.queueTxSig),
            and(
              eq(schema.computations.status, "finalized"),
              isNull(schema.computations.finalizeTxSig)
            ),
            and(
              isNotNull(schema.computations.finalizeTxSig),
              isNull(schema.computations.callbackErrorCode)
            ),
            // Stale "queued" rows: already have queueTxSig but may have been
            // finalized on-chain without the DB status being updated
            and(
              eq(schema.computations.status, "queued"),
              isNotNull(schema.computations.queueTxSig),
              isNull(schema.computations.finalizeTxSig)
            ),
            // Backfill: rows missing on-chain timestamp (queuedAt not resolved yet)
            isNull(schema.computations.queuedAt)
          )
        )
      )
      .orderBy(desc(schema.computations.id))
      .limit(this.batchSize);

    if (rows.length === 0) {
      log.debug("No computations needing tx enrichment", { network: this.network });
      return 0;
    }

    let enriched = 0;

    for (const row of rows) {
      if (!this.running) break;

      try {
        const pubkey = new PublicKey(row.address);
        const sigs = await this.connection.getSignaturesForAddress(pubkey, {
          limit: 20,
        });

        if (sigs.length === 0) {
          log.debug("No signatures found for computation", {
            address: row.address,
          });
          continue;
        }

        // Sigs returned newest-first; oldest = queueTxSig
        const queueSig = sigs[sigs.length - 1].signature;

        // Find the real callback sig: walk from second-oldest forward,
        // skip any sig with error code 6204 (AlreadyCallbackedComputation = duplicate retry),
        // take the first non-6204 sig as the real callback.
        let finalizeSig: string | null = null;
        let callbackErrorCode: number | null = null;
        let callbackSucceeded = false;
        let callbackBlockTime: number | null = null;

        if (sigs.length > 1) {
          // sigs are newest-first, so iterate from second-oldest (index len-2) toward newest
          for (let i = sigs.length - 2; i >= 0; i--) {
            const sig = sigs[i];
            const errCode = extractCustomErrorCode(sig.err);

            // Skip duplicate retry attempts (6204 = AlreadyCallbackedComputation)
            if (errCode === ALREADY_CALLBACKED_CODE) continue;

            finalizeSig = sig.signature;
            callbackBlockTime = sig.blockTime ?? null;
            if (sig.err) {
              // Real error — callback failed
              callbackErrorCode = errCode;
            } else {
              // No error — callback succeeded
              callbackSucceeded = true;
            }
            break;
          }
        }

        const updates: Partial<{
          queueTxSig: string;
          queuedAt: Date;
          finalizeTxSig: string;
          callbackErrorCode: number;
          status: "queued" | "executing" | "finalized" | "failed";
          finalizedAt: Date;
          failedAt: Date;
          updatedAt: Date;
        }> = {};

        if (!row.queueTxSig && queueSig) {
          updates.queueTxSig = queueSig;
        }

        // Set queuedAt from queue transaction's on-chain block time
        if (!row.queuedAt) {
          const queueBlockTime = sigs[sigs.length - 1].blockTime;
          if (queueBlockTime) {
            updates.queuedAt = new Date(queueBlockTime * 1000);
          }
        }

        if (finalizeSig) {
          if (!row.finalizeTxSig) {
            updates.finalizeTxSig = finalizeSig;
          }

          const txTime = callbackBlockTime ? new Date(callbackBlockTime * 1000) : new Date();

          if (callbackErrorCode !== null && row.callbackErrorCode === null) {
            updates.callbackErrorCode = callbackErrorCode;
            // Mark as failed if we found a real error
            if (row.status !== "failed") {
              updates.status = "failed";
              updates.failedAt = txTime;
            }
          } else if (callbackSucceeded) {
            if (row.callbackErrorCode === null) {
              // Store 0 to indicate "checked, no error" — distinguishes from null (unchecked)
              updates.callbackErrorCode = 0;
            }
            // Fix stale "queued" status — callback succeeded means it's finalized
            if (row.status === "queued") {
              updates.status = "finalized";
              updates.finalizedAt = txTime;
              log.info("Fixed stale queued computation → finalized", {
                address: row.address,
              });
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          updates.updatedAt = new Date();
          // Retry DB write up to 3 times (Railway networking can be flaky)
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              await db
                .update(schema.computations)
                .set(updates)
                .where(eq(schema.computations.id, row.id));
              break;
            } catch (dbErr) {
              if (attempt === 3) throw dbErr;
              await sleep(500 * attempt);
            }
          }

          enriched++;
          log.debug("Enriched computation tx sigs", {
            address: row.address,
            queueTxSig: updates.queueTxSig ?? "(already set)",
            finalizeTxSig: updates.finalizeTxSig ?? "(not applicable)",
            callbackErrorCode: updates.callbackErrorCode ?? "(none)",
          });
        }

        // Rate limit between RPC calls
        this.failureCounts.delete(row.address);
        await sleep(this.rateLimitMs);
      } catch (error) {
        const count = (this.failureCounts.get(row.address) ?? 0) + 1;
        this.failureCounts.set(row.address, count);

        if (count >= MAX_ENRICH_FAILURES) {
          // Mark as permanently unenrichable so the query skips it next cycle
          log.warn("Marking computation as unenrichable after repeated failures", {
            address: row.address,
            failures: count,
          });
          try {
            await db
              .update(schema.computations)
              .set({ callbackErrorCode: UNENRICHABLE_SENTINEL, updatedAt: new Date() })
              .where(eq(schema.computations.id, row.id));
          } catch (dbErr) {
            log.error("Failed to mark unenrichable", {
              address: row.address,
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
            });
          }
          this.failureCounts.delete(row.address);
        } else {
          log.error("Failed to enrich computation", {
            address: row.address,
            attempt: count,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (enriched > 0) {
      log.info("TX enrichment batch complete", {
        network: this.network,
        enriched,
        total: rows.length,
      });
    }

    return rows.length;
  }

  stop(): void {
    this.running = false;
    log.info("TX enricher stopped", { network: this.network });
  }
}
