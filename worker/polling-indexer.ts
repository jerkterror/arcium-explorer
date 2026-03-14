import { Connection } from "@solana/web3.js";
import { ARCIUM_PROGRAM_ID } from "@/lib/constants";
import { DISCRIMINATORS, type AccountTypeName } from "@/lib/indexer/discriminators";
import { processAccountUpdate } from "./account-processor";
import { createLogger } from "./logger";
import type { Network } from "@/types";
import { PublicKey } from "@solana/web3.js";

const log = createLogger("polling");

const ARCIUM_PROGRAM = new PublicKey(ARCIUM_PROGRAM_ID);

const ENTITY_TYPES: AccountTypeName[] = [
  "Cluster",
  "ArxNode",
  "MXEAccount",
  "ComputationDefinitionAccount",
  "ComputationAccount",
];

const RPC_TIMEOUT_MS = 120_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`RPC timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function fetchWithRetry(
  connection: Connection,
  discriminator: Buffer,
  retries = 3
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await withTimeout(
        connection.getProgramAccounts(ARCIUM_PROGRAM, {
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: discriminator.toString("base64"),
                encoding: "base64",
              },
            },
          ],
          commitment: "confirmed",
        }),
        RPC_TIMEOUT_MS
      );
    } catch (err) {
      if (attempt === retries) throw err;
      log.warn(`getProgramAccounts attempt ${attempt} failed, retrying`, {
        error: err instanceof Error ? err.message : String(err),
      });
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error("unreachable");
}

async function pollEntityType(
  connection: Connection,
  entityType: AccountTypeName,
  network: Network
): Promise<number> {
  const discriminator = DISCRIMINATORS[entityType];

  const accounts = await fetchWithRetry(connection, discriminator);

  let processed = 0;
  for (const { pubkey, account } of accounts) {
    const result = await processAccountUpdate({
      address: pubkey.toBase58(),
      data: account.data,
      network,
    });
    if (result) processed++;
  }

  return processed;
}

export interface PollingIndexerConfig {
  rpcUrl: string;
  network: Network;
  intervalMs: number;
}

export class PollingIndexer {
  private connection: Connection;
  private network: Network;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private polling = false;

  constructor(config: PollingIndexerConfig) {
    this.connection = new Connection(config.rpcUrl, { commitment: "confirmed" });
    this.network = config.network;
    this.intervalMs = config.intervalMs;
  }

  async pollOnce(): Promise<Record<string, number>> {
    if (this.polling) {
      log.debug("Poll cycle skipped (previous still running)", { network: this.network });
      return {};
    }
    this.polling = true;

    try {
      const results: Record<string, number> = {};

      for (const entityType of ENTITY_TYPES) {
        if (!this.running) break;
        try {
          results[entityType] = await pollEntityType(
            this.connection,
            entityType,
            this.network
          );
        } catch (error) {
          log.error(`Failed to poll ${entityType}`, {
            network: this.network,
            error: error instanceof Error ? error.message : String(error),
          });
          results[entityType] = 0;
        }
      }

      const total = Object.values(results).reduce((a, b) => a + b, 0);
      log.info("Poll cycle complete", { network: this.network, total, results });

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
    });

    // Run immediately, then on interval
    this.pollOnce().catch((err) =>
      log.error("Initial poll failed", { error: String(err) })
    );

    this.timer = setInterval(() => {
      if (!this.running) return;
      this.pollOnce().catch((err) =>
        log.error("Poll cycle failed", { error: String(err) })
      );
    }, this.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info("Polling indexer stopped", { network: this.network });
  }
}
