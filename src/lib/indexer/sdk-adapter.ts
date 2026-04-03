/**
 * SDK adapter: bridges @arcium-hq/client IDL-based deserialization
 * to the explorer's Parsed* interfaces used by the DB upsert layer.
 *
 * Uses BorshAccountsCoder from Anchor to decode raw account buffers
 * (from gRPC/WS subscriptions) without additional RPC calls.
 */
import { BorshAccountsCoder } from "@coral-xyz/anchor";
import { ARCIUM_IDL, ARCIUM_ADDR } from "@arcium-hq/client";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { createLogger } from "@/lib/logger";

const log = createLogger("sdk-adapter");

// Single coder instance — constructed from IDL, no provider needed
const coder = new BorshAccountsCoder(ARCIUM_IDL);

// Re-export client-safe constants (no Node.js deps, safe for "use client" components)
export { UNENRICHABLE_SENTINEL, getArciumError } from "@/lib/arcium-errors";

/** Arcium program PublicKey derived from the SDK IDL. Server-only. */
export const ARCIUM_PROGRAM = new PublicKey(ARCIUM_ADDR);

// ─── Discriminator helpers ─────────────────────────────────────

export const ACCOUNT_NAMES = {
  Cluster: "cluster",
  ArxNode: "arxNode",
  MXEAccount: "mxeAccount",
  ComputationDefinitionAccount: "computationDefinitionAccount",
  ComputationAccount: "computationAccount",
} as const;

export type AccountTypeName = keyof typeof ACCOUNT_NAMES;

const DISCRIMINATOR_MAP = new Map<string, AccountTypeName>();

for (const [typeName, idlName] of Object.entries(ACCOUNT_NAMES)) {
  const disc = coder.accountDiscriminator(idlName);
  // Key is first 8 bytes as hex for fast lookup
  DISCRIMINATOR_MAP.set(
    Buffer.from(disc).toString("hex"),
    typeName as AccountTypeName,
  );
}

/**
 * Match first 8 bytes of account data against known discriminators.
 */
export function identifyAccountType(
  data: Buffer | Uint8Array,
): AccountTypeName | null {
  if (data.length < 8) return null;
  const key = Buffer.from(data.subarray(0, 8)).toString("hex");
  return DISCRIMINATOR_MAP.get(key) ?? null;
}

/**
 * Get discriminator bytes for a given account type (for memcmp filters).
 */
export function getDiscriminatorBytes(type: AccountTypeName): Buffer {
  return Buffer.from(coder.accountDiscriminator(ACCOUNT_NAMES[type]));
}

// ─── Shared helpers ────────────────────────────────────────────

function bnToNumber(val: number | bigint | { toNumber(): number }): number {
  if (typeof val === "number") return val;
  if (typeof val === "bigint") return Number(val);
  return val.toNumber();
}

function bytesToHex(bytes: number[] | Uint8Array): string | null {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (arr.every((b) => b === 0)) return null;
  return Buffer.from(arr).toString("hex");
}

function pubkeyToBase58(val: PublicKey | { toBase58(): string }): string {
  return val.toBase58();
}

// ─── ArxNode ───────────────────────────────────────────────────

export interface ParsedArxNode {
  authorityKey: string;
  ip: string | null;
  clusterOffset: number | null;
  cuCapacityClaim: number;
  isActive: boolean;
  blsPublicKey: string | null;
  x25519PublicKey: string | null;
}

export function decodeArxNode(data: Buffer | Uint8Array): ParsedArxNode | null {
  try {
    const decoded = coder.decode("arxNode", Buffer.from(data));

    // x25519Pubkey: number[32]
    const x25519PublicKey = bytesToHex(decoded.x25519Pubkey);

    // config.authority: PublicKey
    const authorityKey = pubkeyToBase58(decoded.config.authority);

    // metadata.ip: number[4]
    const ipBytes: number[] = decoded.metadata.ip;
    const ipStr = `${ipBytes[0]}.${ipBytes[1]}.${ipBytes[2]}.${ipBytes[3]}`;
    const ip = ipStr === "0.0.0.0" ? null : ipStr;

    // clusterMembership: Anchor enum { inactive: {}, active: number, proposed: number }
    let clusterOffset: number | null = null;
    let isActive = false;
    if (decoded.clusterMembership.active !== undefined) {
      clusterOffset = decoded.clusterMembership.active;
      isActive = true;
    } else if (decoded.clusterMembership.proposed !== undefined) {
      clusterOffset = decoded.clusterMembership.proposed;
    }

    // cuCapacityClaim: BN
    const cuCapacityClaim = bnToNumber(decoded.cuCapacityClaim);

    // blsPubkey: BN254G2BLSPublicKey — Anchor deserializes unnamed struct field as array
    const blsPublicKey = bytesToHex(decoded.blsPubkey[0] ?? decoded.blsPubkey);

    return {
      authorityKey,
      ip,
      clusterOffset,
      cuCapacityClaim,
      isActive,
      blsPublicKey,
      x25519PublicKey,
    };
  } catch (err) {
    log.warn("Failed to decode ArxNode", { error: err instanceof Error ? err.message : String(err), dataLen: data.length });
    return null;
  }
}

// ─── Cluster ───────────────────────────────────────────────────

export interface ParsedCluster {
  clusterSize: number;
  maxCapacity: number;
  cuPrice: number;
  nodeOffsets: number[];
  isActive: boolean;
  blsPublicKey: string | null;
}

export function decodeCluster(data: Buffer | Uint8Array): ParsedCluster | null {
  try {
    const decoded = coder.decode("cluster", Buffer.from(data));

    const clusterSize: number = decoded.clusterSize;

    const maxCapacity = bnToNumber(decoded.maxCapacity);
    const cuPrice = bnToNumber(decoded.cuPrice);

    // activation: { activationEpoch: BN, deactivationEpoch: BN }
    // Active if activationEpoch !== U64_MAX
    const U64_MAX_STR = "18446744073709551615";
    const activationEpoch = decoded.activation.activationEpoch.toString();
    const isActive = activationEpoch !== U64_MAX_STR;

    // nodes: Vec<NodeRef { offset: u32, currentTotalRewards: BN, vote: u8 }>
    const nodeOffsets: number[] = [];
    if (Array.isArray(decoded.nodes)) {
      for (const node of decoded.nodes) {
        nodeOffsets.push(node.offset);
      }
    }

    // blsPublicKey: SetUnset<BN254G2BLSPublicKey>
    // Anchor enum: { set: value } or { unset: [value, bool[]] }
    let blsPublicKey: string | null = null;
    if (decoded.blsPublicKey.set) {
      const inner = decoded.blsPublicKey.set;
      // BN254G2BLSPublicKey may be { 0: number[64] } or number[64] directly
      const bytes = inner[0] ?? inner;
      blsPublicKey = bytesToHex(bytes);
    }

    return {
      clusterSize,
      maxCapacity,
      cuPrice,
      nodeOffsets,
      isActive,
      blsPublicKey,
    };
  } catch (err) {
    log.warn("Failed to decode Cluster", { error: err instanceof Error ? err.message : String(err), dataLen: data.length });
    return null;
  }
}

// ─── MXE Account ───────────────────────────────────────────────

export interface ParsedMXEAccount {
  mxeProgramId: string;
  clusterOffset: number | null;
  authority: string | null;
  x25519Pubkey: string | null;
  compDefOffsets: number[];
}

export function decodeMXEAccount(
  data: Buffer | Uint8Array,
): ParsedMXEAccount | null {
  try {
    const decoded = coder.decode("mxeAccount", Buffer.from(data));

    const mxeProgramId = pubkeyToBase58(decoded.mxeProgramId);

    // cluster: Option<u32> — Anchor deserializes as number | null
    const clusterOffset: number | null = decoded.cluster ?? null;

    // authority: Option<pubkey>
    const authority = decoded.authority
      ? pubkeyToBase58(decoded.authority)
      : null;

    // utilityPubkeys: SetUnset<UtilityPubkeys>
    let x25519Pubkey: string | null = null;
    if (decoded.utilityPubkeys.set) {
      x25519Pubkey = bytesToHex(decoded.utilityPubkeys.set.x25519Pubkey);
    }

    // computationDefinitions: Vec<u32>
    const compDefOffsets: number[] = decoded.computationDefinitions ?? [];

    return {
      mxeProgramId,
      clusterOffset,
      authority,
      x25519Pubkey,
      compDefOffsets,
    };
  } catch (err) {
    log.warn("Failed to decode MXEAccount", { error: err instanceof Error ? err.message : String(err), dataLen: data.length });
    return null;
  }
}

// ─── Computation Definition ────────────────────────────────────

export interface ParsedComputationDefinition {
  cuAmount: number;
  circuitLen: number;
  sourceType: string;
}

export function decodeComputationDefinition(
  data: Buffer | Uint8Array,
): ParsedComputationDefinition | null {
  try {
    const decoded = coder.decode(
      "computationDefinitionAccount",
      Buffer.from(data),
    );

    const cuAmount = bnToNumber(decoded.cuAmount);
    const circuitLen = decoded.definition.circuitLen;

    // circuitSource: Anchor enum { local: ..., onChain: ..., offChain: ... }
    let sourceType = "unknown";
    if (decoded.circuitSource.local !== undefined) {
      sourceType = "local";
    } else if (decoded.circuitSource.onChain !== undefined) {
      sourceType = "onchain";
    } else if (decoded.circuitSource.offChain !== undefined) {
      sourceType = "offchain";
    }

    return { cuAmount, circuitLen, sourceType };
  } catch (err) {
    log.warn("Failed to decode ComputationDefinition", { error: err instanceof Error ? err.message : String(err), dataLen: data.length });
    return null;
  }
}

// ─── Computation ───────────────────────────────────────────────

export interface ParsedComputation {
  compDefOffset: string;
  clusterOffset: number;
  payer: string;
  mxeProgramId: string | null;
  /** On-chain account only stores "queued" or "finalized".
   *  "executing" and "failed" are derived by the tx-enricher from transaction logs. */
  status: "queued" | "executing" | "finalized" | "failed";
  isScaffold: boolean;
  slot: number;
  queuedAt: Date | null;
  executingAt: Date | null;
  finalizedAt: Date | null;
  failedAt: Date | null;
}

export function decodeComputation(
  data: Buffer | Uint8Array,
): ParsedComputation | null {
  try {
    const decoded = coder.decode("computationAccount", Buffer.from(data));

    const payer = pubkeyToBase58(decoded.payer);
    const mxeProgramId = pubkeyToBase58(decoded.mxeProgramId);
    const compDefOffset = decoded.computationDefinitionOffset.toString();
    const slot = bnToNumber(decoded.slot);

    // status: Anchor enum — only Queued and Finalized exist on-chain
    let status: ParsedComputation["status"] = "queued";
    if (decoded.status.finalized !== undefined) {
      status = "finalized";
    }

    const isScaffold = payer === SystemProgram.programId.toBase58();

    return {
      compDefOffset,
      clusterOffset: 0, // derived via MXE join, not stored on computation
      payer,
      mxeProgramId,
      status,
      isScaffold,
      slot,
      queuedAt: null,
      executingAt: null,
      finalizedAt: null,
      failedAt: null,
    };
  } catch (err) {
    log.warn("Failed to decode Computation", { error: err instanceof Error ? err.message : String(err), dataLen: data.length });
    return null;
  }
}
