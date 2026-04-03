import { Connection } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { getDiscriminatorBytes, ARCIUM_PROGRAM, type AccountTypeName } from "@/lib/indexer/sdk-adapter";
import { processAccountUpdate } from "./account-processor";
import { createLogger } from "@/lib/logger";
import { withTimeout, sleep } from "./utils";
import type { Network } from "@/types";

const log = createLogger("polling");

// Entity types that can be polled in parallel (small, always re-processed)
const PARALLEL_TYPES: AccountTypeName[] = [
  "Cluster",
  "ArxNode",
  "MXEAccount",
  "ComputationDefinitionAccount",
];

// Large entity type polled separately (only new accounts processed)
const SEQUENTIAL_TYPES: AccountTypeName[] = ["ComputationAccount"];

const RPC_TIMEOUT_MS = 120_000;

// Lazy db import to avoid errors when DATABASE_URL is missing at build time
async function getDb() {
  const { db } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  return { db, schema };
}

function getTable(schema: Awaited<ReturnType<typeof getDb>>["schema"], entityType: AccountTypeName) {
  const tableMap = {
    Cluster: schema.clusters,
    ArxNode: schema.arxNodes,
    MXEAccount: schema.mxeAccounts,
    ComputationDefinitionAccount: schema.computationDefinitions,
    ComputationAccount: schema.computations,
  } as const;
  return tableMap[entityType];
}

async function getKnownAddresses(entityType: AccountTypeName, network: Network): Promise<Set<string>> {
  const { db, schema } = await getDb();
  const table = getTable(schema, entityType);
  const rows = await db.select({ address: table.address }).from(table).where(eq(table.network, network));
  return new Set(rows.map(r => r.address));
}

async function fetchWithRetry(
  connection: Connection,
  discriminator: Buffer,
  retries = 3,
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await withTimeout(
        connection.getProgramAccounts(ARCIUM_PROGRAM, {
          filters: [{
            memcmp: {
              offset: 0,
              bytes: discriminator.toString("base64"),
              encoding: "base64",
            },
          }],
          commitment: "confirmed",
        }),
        RPC_TIMEOUT_MS,
        "getProgramAccounts",
      );
    } catch (err) {
      if (attempt === retries) throw err;
      log.warn(`getProgramAccounts attempt ${attempt} failed, retrying`, {
        error: err instanceof Error ? err.message : String(err),
      });
      await sleep(1000 * attempt);
    }
  }
  throw new Error("unreachable");
}

async function pollEntityType(
  connection: Connection,
  entityType: AccountTypeName,
  network: Network,
  onlyNew: boolean,
): Promise<{ processed: number; skipped: number }> {
  const discriminator = getDiscriminatorBytes(entityType);
  const accounts = await fetchWithRetry(connection, discriminator);

  let knownAddresses: Set<string> | null = null;
  if (onlyNew) {
    knownAddresses = await getKnownAddresses(entityType, network);
  }

  let processed = 0;
  let skipped = 0;
  for (const { pubkey, account } of accounts) {
    const address = pubkey.toBase58();

    if (knownAddresses?.has(address)) {
      skipped++;
      continue;
    }

    const result = await processAccountUpdate({
      address,
      data: account.data,
      network,
    });
    if (result) processed++;
  }

  return { processed, skipped };
}

export interface PollingIndexerConfig {
  rpcUrl: string;
  network: Network;
  intervalMs: number;
  startDelayMs?: number;
}

export class PollingIndexer {
  private connection: Connection;
  private network: Network;
  private intervalMs: number;
  private startDelayMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private delayTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private polling = false;

  constructor(config: PollingIndexerConfig) {
    this.connection = new Connection(config.rpcUrl, { commitment: "confirmed" });
    this.network = config.network;
    this.intervalMs = config.intervalMs;
    this.startDelayMs = config.startDelayMs ?? 0;
  }

  async pollOnce(): Promise<Record<string, { processed: number; skipped: number }>> {
    if (this.polling) {
      log.debug("Poll cycle skipped (previous still running)", { network: this.network });
      return {};
    }
    this.polling = true;

    try {
      const results: Record<string, { processed: number; skipped: number }> = {};

      // Poll small entity types in parallel (always re-process all)
      const parallelResults = await Promise.all(
        PARALLEL_TYPES.map(async (entityType) => {
          try {
            return { entityType, result: await pollEntityType(this.connection, entityType, this.network, false) };
          } catch (error) {
            log.error(`Failed to poll ${entityType}`, {
              network: this.network,
              error: error instanceof Error ? error.message : String(error),
            });
            return { entityType, result: { processed: 0, skipped: 0 } };
          }
        }),
      );
      for (const { entityType, result } of parallelResults) {
        results[entityType] = result;
      }

      // Poll large entity types sequentially (only new accounts)
      for (const entityType of SEQUENTIAL_TYPES) {
        if (!this.running) break;
        try {
          results[entityType] = await pollEntityType(this.connection, entityType, this.network, true);
        } catch (error) {
          log.error(`Failed to poll ${entityType}`, {
            network: this.network,
            error: error instanceof Error ? error.message : String(error),
          });
          results[entityType] = { processed: 0, skipped: 0 };
        }
      }

      const totalProcessed = Object.values(results).reduce((a, b) => a + b.processed, 0);
      const totalSkipped = Object.values(results).reduce((a, b) => a + b.skipped, 0);
      log.info("Poll cycle complete", {
        network: this.network,
        totalProcessed,
        totalSkipped,
        results,
      });

      return results;
    } finally {
      this.polling = false;
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    log.info("Polling indexer started", {
      network: this.network,
      intervalMs: this.intervalMs,
      startDelayMs: this.startDelayMs,
    });

    const beginPolling = () => {
      this.pollOnce().catch((err) =>
        log.error("Initial poll failed", { error: String(err) }),
      );

      this.timer = setInterval(() => {
        if (!this.running) return;
        this.pollOnce().catch((err) =>
          log.error("Poll cycle failed", { error: String(err) }),
        );
      }, this.intervalMs);
    };

    if (this.startDelayMs > 0) {
      log.info("Delaying first poll", { network: this.network, delayMs: this.startDelayMs });
      this.delayTimer = setTimeout(() => {
        this.delayTimer = null;
        if (this.running) beginPolling();
      }, this.startDelayMs);
    } else {
      beginPolling();
    }
  }

  stop(): void {
    this.running = false;
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info("Polling indexer stopped", { network: this.network });
  }
}
