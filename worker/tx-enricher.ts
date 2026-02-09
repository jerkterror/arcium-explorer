import { Connection, PublicKey } from "@solana/web3.js";
import { createLogger } from "./logger";
import type { Network } from "@/types";

const log = createLogger("tx-enricher");

async function getDb() {
  const { db } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  return { db, schema };
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
      const { eq, and, or, isNull, sql } = await import("drizzle-orm");

      // Find computations missing tx signatures (excluding scaffolds)
      const rows = await db
        .select({
          id: schema.computations.id,
          address: schema.computations.address,
          status: schema.computations.status,
          queueTxSig: schema.computations.queueTxSig,
          finalizeTxSig: schema.computations.finalizeTxSig,
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
          // If finalized and more than 1 sig, newest = finalizeTxSig
          const finalizeSig =
            row.status === "finalized" && sigs.length > 1
              ? sigs[0].signature
              : null;

          const updates: Record<string, string> = {};
          if (!row.queueTxSig && queueSig) {
            updates.queue_tx_sig = queueSig;
          }
          if (!row.finalizeTxSig && finalizeSig) {
            updates.finalize_tx_sig = finalizeSig;
          }

          if (Object.keys(updates).length > 0) {
            // Build dynamic SET clause
            const setClauses = Object.entries(updates)
              .map(([col, val]) => sql`${sql.raw(col)} = ${val}`)
              .reduce((a, b) => sql`${a}, ${b}`);

            await db.execute(
              sql`UPDATE computations SET ${setClauses}, updated_at = NOW() WHERE id = ${row.id}`
            );

            enriched++;
            log.debug("Enriched computation tx sigs", {
              address: row.address,
              queueTxSig: updates.queue_tx_sig ?? "(already set)",
              finalizeTxSig: updates.finalize_tx_sig ?? "(not applicable)",
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
