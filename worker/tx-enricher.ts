import { Connection, PublicKey } from "@solana/web3.js";
import { createLogger } from "./logger";
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
}

export class TxEnricher {
  private connection: Connection;
  private network: Network;
  private batchSize: number;
  private intervalMs: number;
  private rateLimitMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private processing = false;

  constructor(config: TxEnricherConfig) {
    this.connection = new Connection(config.rpcUrl, { commitment: "confirmed" });
    this.network = config.network;
    this.batchSize = config.batchSize ?? 10;
    this.intervalMs = config.intervalMs ?? 30_000;
    this.rateLimitMs = config.rateLimitMs ?? 100;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    log.info("TX enricher started", {
      network: this.network,
      batchSize: this.batchSize,
      intervalMs: this.intervalMs,
      rateLimitMs: this.rateLimitMs,
    });

    // Initial delay: let indexing populate computations first
    setTimeout(() => {
      if (!this.running) return;
      this.enrich().catch((err) =>
        log.error("Initial enrichment failed", { error: String(err) })
      );
    }, 60_000);

    this.timer = setInterval(() => {
      if (!this.running) return;
      this.enrich().catch((err) =>
        log.error("Enrichment cycle failed", { error: String(err) })
      );
    }, this.intervalMs);
  }

  private async enrich(): Promise<void> {
    if (this.processing) {
      log.debug("Enrichment cycle skipped (previous still running)");
      return;
    }
    this.processing = true;

    try {
      const { db, schema } = await getDb();
      const { eq, and, or, isNull, isNotNull } = await import("drizzle-orm");

      // Find computations needing enrichment:
      // 1. Missing queueTxSig (need to find queue tx)
      // 2. Finalized but missing finalizeTxSig (need to find callback tx)
      // 3. Has finalizeTxSig but callbackErrorCode not yet checked (need error extraction)
      // 4. Queued with queueTxSig set but no finalizeTxSig — may be stale (finalized on-chain
      //    but WS/polling missed the update)
      const rows = await db
        .select({
          id: schema.computations.id,
          address: schema.computations.address,
          status: schema.computations.status,
          queueTxSig: schema.computations.queueTxSig,
          finalizeTxSig: schema.computations.finalizeTxSig,
          callbackErrorCode: schema.computations.callbackErrorCode,
        })
        .from(schema.computations)
        .where(
          and(
            eq(schema.computations.network, this.network),
            eq(schema.computations.isScaffold, false),
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
              )
            )
          )
        )
        .orderBy(schema.computations.id)
        .limit(this.batchSize);

      if (rows.length === 0) {
        log.debug("No computations needing tx enrichment", { network: this.network });
        return;
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

          if (sigs.length > 1) {
            // sigs are newest-first, so iterate from second-oldest (index len-2) toward newest
            for (let i = sigs.length - 2; i >= 0; i--) {
              const sig = sigs[i];
              const errCode = extractCustomErrorCode(sig.err);

              // Skip duplicate retry attempts (6204 = AlreadyCallbackedComputation)
              if (errCode === ALREADY_CALLBACKED_CODE) continue;

              finalizeSig = sig.signature;
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

          if (finalizeSig) {
            if (!row.finalizeTxSig) {
              updates.finalizeTxSig = finalizeSig;
            }

            if (callbackErrorCode !== null && row.callbackErrorCode === null) {
              updates.callbackErrorCode = callbackErrorCode;
              // Mark as failed if we found a real error
              if (row.status !== "failed") {
                updates.status = "failed";
                updates.failedAt = new Date();
              }
            } else if (callbackSucceeded) {
              if (row.callbackErrorCode === null) {
                // Store 0 to indicate "checked, no error" — distinguishes from null (unchecked)
                updates.callbackErrorCode = 0;
              }
              // Fix stale "queued" status — callback succeeded means it's finalized
              if (row.status === "queued") {
                updates.status = "finalized";
                updates.finalizedAt = new Date();
                log.info("Fixed stale queued computation → finalized", {
                  address: row.address,
                });
              }
            }
          }

          if (Object.keys(updates).length > 0) {
            updates.updatedAt = new Date();
            await db
              .update(schema.computations)
              .set(updates)
              .where(eq(schema.computations.id, row.id));

            enriched++;
            log.debug("Enriched computation tx sigs", {
              address: row.address,
              queueTxSig: updates.queueTxSig ?? "(already set)",
              finalizeTxSig: updates.finalizeTxSig ?? "(not applicable)",
              callbackErrorCode: updates.callbackErrorCode ?? "(none)",
            });
          }

          // Rate limit between RPC calls
          await this.sleep(this.rateLimitMs);
        } catch (error) {
          log.error("Failed to enrich computation", {
            address: row.address,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (enriched > 0) {
        log.info("TX enrichment cycle complete", {
          network: this.network,
          enriched,
          total: rows.length,
        });
      }
    } finally {
      this.processing = false;
    }
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info("TX enricher stopped", { network: this.network });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
