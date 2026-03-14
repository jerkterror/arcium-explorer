import { createLogger } from "./logger";
import { PollingIndexer } from "./polling-indexer";
import { GrpcSubscriber } from "./grpc-subscriber";
import { WsSubscriber } from "./ws-subscriber";
import { TxEnricher } from "./tx-enricher";
import { SnapshotWriter } from "./snapshot-writer";
import type { Network } from "@/types";

const log = createLogger("main");

const ENABLE_MAINNET = process.env.ENABLE_MAINNET !== "false";
const ENABLE_DEVNET = process.env.ENABLE_DEVNET !== "false";

const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL || "https://poc-rpc.layer33.com";
const DEVNET_RPC_URL = process.env.DEVNET_RPC_URL || "https://api.devnet.solana.com";
const MAINNET_GRPC_ENDPOINT = process.env.MAINNET_GRPC_ENDPOINT || "https://poc-rpc.layer33.com:10000";
const MAINNET_GRPC_TOKEN = process.env.MAINNET_GRPC_TOKEN || undefined;
const DEVNET_WS_URL = process.env.DEVNET_WS_URL || undefined;
const MAINNET_ENRICHER_RPC_URL = process.env.MAINNET_ENRICHER_RPC_URL || undefined;

const DEVNET_POLL_INTERVAL = 5 * 60_000;     // 5min (WS is primary, this is consistency check)
const MAINNET_POLL_INTERVAL = 5 * 60_000;    // 5min (gRPC is primary, this is consistency check)
const SNAPSHOT_INTERVAL = 5 * 60_000;        // 5min
const HEARTBEAT_INTERVAL = 5 * 60_000;       // 5min

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
    devnetWsUrl: DEVNET_WS_URL ?? "(derived from rpcUrl)",
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

    // TX signature enricher for mainnet (requires RPC with tx history)
    if (MAINNET_ENRICHER_RPC_URL) {
      const mainnetEnricher = new TxEnricher({
        rpcUrl: MAINNET_ENRICHER_RPC_URL,
        network: "mainnet",
        batchSize: 50,
        rateLimitMs: 200,
      });
      mainnetEnricher.start();
      services.push(mainnetEnricher);
      log.info("Mainnet TX enricher enabled", { rpcUrl: MAINNET_ENRICHER_RPC_URL });
    }

    log.info("Mainnet indexing enabled (gRPC + polling)");
  }

  if (ENABLE_DEVNET) {
    activeNetworks.push("devnet");

    // Primary: WebSocket subscription for real-time updates
    const wsSub = new WsSubscriber({
      rpcUrl: DEVNET_RPC_URL,
      wsUrl: DEVNET_WS_URL,
      network: "devnet",
    });
    services.push(wsSub);
    wsSub.start().catch((err) =>
      log.error("WS subscriber fatal error", { error: String(err) })
    );

    // Secondary: slow polling for consistency checks
    const devnetPoller = new PollingIndexer({
      rpcUrl: DEVNET_RPC_URL,
      network: "devnet",
      intervalMs: DEVNET_POLL_INTERVAL,
    });
    devnetPoller.start();
    services.push(devnetPoller);

    // TX signature enricher for devnet
    const devnetEnricher = new TxEnricher({
      rpcUrl: DEVNET_RPC_URL,
      network: "devnet",
      batchSize: 50,
      rateLimitMs: 100,
    });
    devnetEnricher.start();
    services.push(devnetEnricher);

    log.info("Devnet indexing enabled (WS + polling + tx enricher)");
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

// Handle unhandled promise rejections from gRPC NAPI binding (channel closed on GC)
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes("channel closed")) {
    log.debug("gRPC channel closed (expected during reconnect)", { error: msg });
    return;
  }
  log.error("Unhandled promise rejection", { error: msg });
});

main().catch((error) => {
  log.error("Worker failed to start", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
