import { PublicKey } from "@solana/web3.js";

// ─── Cluster ────────────────────────────────────────────────────

export interface ParsedCluster {
  clusterSize: number;
  maxCapacity: number;
  cuPrice: number;
  nodeOffsets: number[];
  isActive: boolean;
  blsPublicKey: string | null;
}

export function parseClusterAccount(data: Buffer | Uint8Array): ParsedCluster | null {
  try {
    const buf = Buffer.from(data);
    if (buf.length < 16) return null;

    // Skip 8-byte discriminator
    let offset = 8;

    const clusterSize = buf.readUInt32LE(offset);
    offset += 4;

    const maxCapacity = buf.readUInt32LE(offset);
    offset += 4;

    const cuPrice = Number(buf.readBigUInt64LE(offset));
    offset += 8;

    const isActive = buf[offset] === 1;
    offset += 1;

    // node_offsets: Vec<u32> (length-prefixed)
    const nodeCount = buf.readUInt32LE(offset);
    offset += 4;
    const nodeOffsets: number[] = [];
    for (let i = 0; i < Math.min(nodeCount, 100); i++) {
      if (offset + 4 > buf.length) break;
      nodeOffsets.push(buf.readUInt32LE(offset));
      offset += 4;
    }

    // BLS public key (48 bytes for BLS12-381)
    let blsPublicKey: string | null = null;
    if (offset + 48 <= buf.length) {
      const blsBytes = buf.subarray(offset, offset + 48);
      if (blsBytes.some((b) => b !== 0)) {
        blsPublicKey = Buffer.from(blsBytes).toString("hex");
      }
    }

    return { clusterSize, maxCapacity, cuPrice, nodeOffsets, isActive, blsPublicKey };
  } catch {
    return null;
  }
}

// ─── ArxNode ────────────────────────────────────────────────────

export interface ParsedArxNode {
  authorityKey: string;
  ip: string | null;
  clusterOffset: number | null;
  cuCapacityClaim: number;
  isActive: boolean;
  blsPublicKey: string | null;
  x25519PublicKey: string | null;
}

export function parseArxNodeAccount(data: Buffer | Uint8Array): ParsedArxNode | null {
  try {
    const buf = Buffer.from(data);
    if (buf.length < 50) return null;

    let offset = 8; // skip discriminator

    // authority (Pubkey, 32 bytes)
    const authorityKey = new PublicKey(buf.subarray(offset, offset + 32)).toBase58();
    offset += 32;

    // ip: Option<String> (1 byte discriminant + length-prefixed string)
    let ip: string | null = null;
    if (buf[offset] === 1) {
      offset += 1;
      const ipLen = buf.readUInt32LE(offset);
      offset += 4;
      if (ipLen > 0 && ipLen < 64 && offset + ipLen <= buf.length) {
        ip = buf.subarray(offset, offset + ipLen).toString("utf8");
        offset += ipLen;
      }
    } else {
      offset += 1;
    }

    // cluster_offset: Option<u32>
    let clusterOffset: number | null = null;
    if (buf[offset] === 1) {
      offset += 1;
      clusterOffset = buf.readUInt32LE(offset);
      offset += 4;
    } else {
      offset += 1;
    }

    // cu_capacity_claim: u32
    const cuCapacityClaim = offset + 4 <= buf.length ? buf.readUInt32LE(offset) : 0;
    offset += 4;

    // is_active: bool
    const isActive = offset < buf.length ? buf[offset] === 1 : false;
    offset += 1;

    // bls_public_key: Option<[u8; 48]>
    let blsPublicKey: string | null = null;
    if (offset < buf.length && buf[offset] === 1) {
      offset += 1;
      if (offset + 48 <= buf.length) {
        blsPublicKey = Buffer.from(buf.subarray(offset, offset + 48)).toString("hex");
        offset += 48;
      }
    } else {
      offset += 1;
    }

    // x25519_public_key: Option<[u8; 32]>
    let x25519PublicKey: string | null = null;
    if (offset < buf.length && buf[offset] === 1) {
      offset += 1;
      if (offset + 32 <= buf.length) {
        x25519PublicKey = Buffer.from(buf.subarray(offset, offset + 32)).toString("hex");
      }
    }

    return { authorityKey, ip, clusterOffset, cuCapacityClaim, isActive, blsPublicKey, x25519PublicKey };
  } catch {
    return null;
  }
}

// ─── MXE Account ────────────────────────────────────────────────

export interface ParsedMXEAccount {
  mxeProgramId: string;
  clusterOffset: number | null;
  authority: string | null;
  x25519Pubkey: string | null;
  compDefOffsets: number[];
}

export function parseMXEAccount(data: Buffer | Uint8Array): ParsedMXEAccount | null {
  try {
    const buf = Buffer.from(data);
    if (buf.length < 42) return null;

    let offset = 8; // skip discriminator

    // mxe_program_id: Pubkey (32 bytes)
    const mxeProgramId = new PublicKey(buf.subarray(offset, offset + 32)).toBase58();
    offset += 32;

    // cluster_offset: Option<u32>
    let clusterOffset: number | null = null;
    if (buf[offset] === 1) {
      offset += 1;
      clusterOffset = buf.readUInt32LE(offset);
      offset += 4;
    } else {
      offset += 1;
    }

    // authority: Option<Pubkey>
    let authority: string | null = null;
    if (offset < buf.length && buf[offset] === 1) {
      offset += 1;
      if (offset + 32 <= buf.length) {
        authority = new PublicKey(buf.subarray(offset, offset + 32)).toBase58();
        offset += 32;
      }
    } else {
      offset += 1;
    }

    // x25519_pubkey: Option<[u8; 32]>
    let x25519Pubkey: string | null = null;
    if (offset < buf.length && buf[offset] === 1) {
      offset += 1;
      if (offset + 32 <= buf.length) {
        x25519Pubkey = Buffer.from(buf.subarray(offset, offset + 32)).toString("hex");
        offset += 32;
      }
    } else {
      offset += 1;
    }

    // comp_def_offsets: Vec<u32>
    const compDefOffsets: number[] = [];
    if (offset + 4 <= buf.length) {
      const count = buf.readUInt32LE(offset);
      offset += 4;
      for (let i = 0; i < Math.min(count, 1000); i++) {
        if (offset + 4 > buf.length) break;
        compDefOffsets.push(buf.readUInt32LE(offset));
        offset += 4;
      }
    }

    return { mxeProgramId, clusterOffset, authority, x25519Pubkey, compDefOffsets };
  } catch {
    return null;
  }
}

// ─── Computation Definition ─────────────────────────────────────

export interface ParsedComputationDefinition {
  mxeProgramId: string;
  defOffset: number;
  cuAmount: number;
  circuitLen: number;
  sourceType: string;
}

export function parseComputationDefinitionAccount(data: Buffer | Uint8Array): ParsedComputationDefinition | null {
  try {
    const buf = Buffer.from(data);
    if (buf.length < 52) return null;

    let offset = 8; // skip discriminator

    // mxe_program_id: Pubkey (32 bytes)
    const mxeProgramId = new PublicKey(buf.subarray(offset, offset + 32)).toBase58();
    offset += 32;

    // def_offset: u32
    const defOffset = buf.readUInt32LE(offset);
    offset += 4;

    // cu_amount: u32
    const cuAmount = buf.readUInt32LE(offset);
    offset += 4;

    // circuit_len: u32
    const circuitLen = buf.readUInt32LE(offset);
    offset += 4;

    // source_type: u8 enum (0=onchain, 1=offchain, 2=hybrid)
    const sourceTypeByte = offset < buf.length ? buf[offset] : 0;
    const SOURCE_TYPE_MAP: Record<number, string> = { 0: "onchain", 1: "offchain", 2: "hybrid" };
    const sourceType = SOURCE_TYPE_MAP[sourceTypeByte] ?? "unknown";

    return { mxeProgramId, defOffset, cuAmount, circuitLen, sourceType };
  } catch {
    return null;
  }
}

// ─── Computation ────────────────────────────────────────────────

export interface ParsedComputation {
  computationOffset: string;
  clusterOffset: number;
  payer: string;
  mxeProgramId: string | null;
  status: "queued" | "executing" | "finalized" | "failed";
  queuedAt: Date | null;
  executingAt: Date | null;
  finalizedAt: Date | null;
  failedAt: Date | null;
}

export function parseComputationAccount(data: Buffer | Uint8Array): ParsedComputation | null {
  try {
    const buf = Buffer.from(data);
    if (buf.length < 80) return null;

    let offset = 8; // skip discriminator

    // computation_offset: u64 (stored as string for precision)
    const computationOffset = buf.readBigUInt64LE(offset).toString();
    offset += 8;

    // cluster_offset: u32
    const clusterOffset = buf.readUInt32LE(offset);
    offset += 4;

    // payer: Pubkey (32 bytes)
    const payer = new PublicKey(buf.subarray(offset, offset + 32)).toBase58();
    offset += 32;

    // mxe_program_id: Option<Pubkey>
    let mxeProgramId: string | null = null;
    if (offset < buf.length && buf[offset] === 1) {
      offset += 1;
      if (offset + 32 <= buf.length) {
        mxeProgramId = new PublicKey(buf.subarray(offset, offset + 32)).toBase58();
        offset += 32;
      }
    } else {
      offset += 1;
    }

    // status: u8 enum
    const statusByte = offset < buf.length ? buf[offset] : 0;
    offset += 1;
    const STATUS_MAP: Record<number, "queued" | "executing" | "finalized" | "failed"> = {
      0: "queued",
      1: "executing",
      2: "finalized",
      3: "failed",
    };
    const status = STATUS_MAP[statusByte] ?? "queued";

    // Timestamp helper: read Option<i64> as Date
    function readOptionalTimestamp(): Date | null {
      if (offset >= buf.length || buf[offset] !== 1) {
        offset += 1;
        return null;
      }
      offset += 1;
      if (offset + 8 > buf.length) return null;
      const ts = Number(buf.readBigInt64LE(offset));
      offset += 8;
      // Solana timestamps are Unix seconds
      return ts > 0 ? new Date(ts * 1000) : null;
    }

    const queuedAt = readOptionalTimestamp();
    const executingAt = readOptionalTimestamp();
    const finalizedAt = readOptionalTimestamp();
    const failedAt = readOptionalTimestamp();

    return {
      computationOffset,
      clusterOffset,
      payer,
      mxeProgramId,
      status,
      queuedAt,
      executingAt,
      finalizedAt,
      failedAt,
    };
  } catch {
    return null;
  }
}
