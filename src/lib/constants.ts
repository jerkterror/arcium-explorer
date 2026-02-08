export const ARCIUM_PROGRAM_ID = "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ";

export const RPC_ENDPOINTS = {
  devnet: process.env.NEXT_PUBLIC_DEVNET_RPC_URL || "https://api.devnet.solana.com",
  mainnet: process.env.NEXT_PUBLIC_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com",
} as const;

export const DEFAULT_NETWORK = "devnet" as const;
export const DEFAULT_PAGE_SIZE = 20;
export const INDEXER_INTERVAL_MS = 30_000;

// gRPC / Worker config
export const MAINNET_GRPC_ENDPOINT = process.env.MAINNET_GRPC_ENDPOINT || "poc-rpc.layer33.com:10000";
export const MAINNET_GRPC_TOKEN = process.env.MAINNET_GRPC_TOKEN || undefined;

export const STATUS_COLORS = {
  queued: {
    bg: "bg-status-queued/10",
    text: "text-status-queued",
    border: "border-status-queued/30",
    dot: "bg-status-queued",
  },
  executing: {
    bg: "bg-status-executing/10",
    text: "text-status-executing",
    border: "border-status-executing/30",
    dot: "bg-status-executing",
  },
  finalized: {
    bg: "bg-status-finalized/10",
    text: "text-status-finalized",
    border: "border-status-finalized/30",
    dot: "bg-status-finalized",
  },
  failed: {
    bg: "bg-status-failed/10",
    text: "text-status-failed",
    border: "border-status-failed/30",
    dot: "bg-status-failed",
  },
} as const;
