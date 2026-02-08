import { createLogger } from "./logger";
import { PollingIndexer } from "./polling-indexer";
import { GrpcSubscriber } from "./grpc-subscriber";
import { SnapshotWriter } from "./snapshot-writer";
import type { Network } from "@/types";

const log = createLogger("main");

const ENABLE_MAINNET = process.env.ENABLE_MAINNET !== "false";
const ENABLE_DEVNET = process.env.ENABLE_DEVNET !== "false";

const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL || "https://poc-rpc.layer33.com";
const DEVNET_RPC_URL = process.env.DEVNET_RPC_URL || "https://api.devnet.solana.com";
const MAINNET_GRPC_ENDPOINT = process.env.MAINNET_GRPC_ENDPOINT || "poc-rpc.layer33.com:10000";
const MAINNET_GRPC_TOKEN = process.env.MAINNET_GRPC_TOKEN || undefined;

const DEVNET_POLL_INTERVAL = 30_000;         // 30s
const MAINNET_POLL_INTERVAL = 5 * 60_000;    // 5min (consistency check, gRPC is primary)
const SNAPSHOT_INTERVAL = 5 * 60_000;        // 5min
const HEARTBEAT_INTERVAL = 60_000;           // 1min

// Track active services for graceful shutdown
const services: { stop: () => void }[] = [];

async function verifyDatabase(): Promise<void> {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const result = await db.execute(sql`SELECT 1 as ok`);
  if (!result) throw new Error("Database ping failed");
  log.info("Database connection verified");
}

async function main(): Promise<void> {
  log.info("Worker starting", {
    enableMainnet: ENABLE_MAINNET,
    enableDevnet: ENABLE_DEVNET,
    mainnetRpc: MAINNET_RPC_URL,
    devnetRpc: DEVNET_RPC_URL,
    grpcEndpoint: MAINNET_GRPC_ENDPOINT,
  });

  // Verify DB connection before anything else
  await verifyDatabase();

  const activeNetworks: Network[] = [];

  if (ENABLE_MAINNET) {
    activeNetworks.push("mainnet");

    // Primary: gRPC streaming for real-time updates
    const grpcSub = new GrpcSubscriber({
      endpoint: MAINNET_GRPC_ENDPOINT,
      token: MAINNET_GRPC_TOKEN,
      network: "mainnet",
    });
    services.push(grpcSub);
    // Start gRPC in background (it runs its own reconnect loop)
    grpcSub.start().catch((err) =>
      log.error("gRPC subscriber fatal error", { error: String(err) })
    );

    // Secondary: slow polling for consistency checks
    const mainnetPoller = new PollingIndexer({
      rpcUrl: MAINNET_RPC_URL,
      network: "mainnet",
      intervalMs: MAINNET_POLL_INTERVAL,
    });
    mainnetPoller.start();
    services.push(mainnetPoller);

    log.info("Mainnet indexing enabled (gRPC + polling)");
  }

  if (ENABLE_DEVNET) {
    activeNetworks.push("devnet");

    const devnetPoller = new PollingIndexer({
      rpcUrl: DEVNET_RPC_URL,
      network: "devnet",
      intervalMs: DEVNET_POLL_INTERVAL,
    });
    devnetPoller.start();
    services.push(devnetPoller);

    log.info("Devnet indexing enabled (polling)");
  }

  // Snapshot writer (captures time-series data)
  if (activeNetworks.length > 0) {
    const snapshotWriter = new SnapshotWriter(SNAPSHOT_INTERVAL, activeNetworks);
    snapshotWriter.start();
    services.push(snapshotWriter);
  }

  // Heartbeat logging
  const heartbeat = setInterval(() => {
    log.info("Heartbeat", {
      uptime: Math.floor(process.uptime()),
      memMB: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
      networks: activeNetworks,
    });
  }, HEARTBEAT_INTERVAL);

  log.info("Worker fully initialized", { networks: activeNetworks });

  // Graceful shutdown
  const shutdown = () => {
    log.info("Shutdown signal received, stopping services...");
    clearInterval(heartbeat);
    for (const service of services) {
      service.stop();
    }
    // Give services time to clean up
    setTimeout(() => {
      log.info("Worker shutdown complete");
      process.exit(0);
    }, 2000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  log.error("Worker failed to start", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
