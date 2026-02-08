import { count, eq, and } from "drizzle-orm";
import { createLogger } from "./logger";
import type { Network } from "@/types";

const log = createLogger("snapshots");

async function getDb() {
  const { db } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  return { db, schema };
}

async function writeSnapshot(network: Network): Promise<void> {
  const { db, schema } = await getDb();

  const [clusterCount] = await db
    .select({ count: count() })
    .from(schema.clusters)
    .where(eq(schema.clusters.network, network));

  const [activeNodeCount] = await db
    .select({ count: count() })
    .from(schema.arxNodes)
    .where(
      and(
        eq(schema.arxNodes.network, network),
        eq(schema.arxNodes.isActive, true)
      )
    );

  const [computationCount] = await db
    .select({ count: count() })
    .from(schema.computations)
    .where(eq(schema.computations.network, network));

  // Approximate computations per minute: count finalized in last 5 minutes / 5
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
  const { gte } = await import("drizzle-orm");
  const [recentCount] = await db
    .select({ count: count() })
    .from(schema.computations)
    .where(
      and(
        eq(schema.computations.network, network),
        eq(schema.computations.status, "finalized"),
        gte(schema.computations.finalizedAt, fiveMinAgo)
      )
    );

  const computationsPerMin = recentCount.count / 5;

  await db.insert(schema.networkSnapshots).values({
    timestamp: new Date(),
    totalClusters: clusterCount.count,
    activeNodes: activeNodeCount.count,
    totalComputations: computationCount.count,
    computationsPerMin,
    network,
  });

  log.info("Snapshot written", {
    network,
    clusters: clusterCount.count,
    activeNodes: activeNodeCount.count,
    computations: computationCount.count,
    cpm: computationsPerMin,
  });
}

export class SnapshotWriter {
  private intervalMs: number;
  private networks: Network[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(intervalMs: number, networks: Network[]) {
    this.intervalMs = intervalMs;
    this.networks = networks;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    log.info("Snapshot writer started", {
      intervalMs: this.intervalMs,
      networks: this.networks,
    });

    // Initial snapshot after a short delay (let first poll complete)
    setTimeout(() => {
      if (!this.running) return;
      this.writeAll().catch((err) =>
        log.error("Initial snapshot failed", { error: String(err) })
      );
    }, 60_000);

    this.timer = setInterval(() => {
      if (!this.running) return;
      this.writeAll().catch((err) =>
        log.error("Snapshot cycle failed", { error: String(err) })
      );
    }, this.intervalMs);
  }

  private async writeAll(): Promise<void> {
    for (const network of this.networks) {
      try {
        await writeSnapshot(network);
      } catch (error) {
        log.error("Snapshot write failed", {
          network,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info("Snapshot writer stopped");
  }
}
