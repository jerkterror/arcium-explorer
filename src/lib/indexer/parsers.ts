import { PublicKey } from "@solana/web3.js";

// ─── Borsh helpers ──────────────────────────────────────────────

function readPubkey(buf: Buffer, offset: number): string {
  return new PublicKey(buf.subarray(offset, offset + 32)).toBase58();
}

function readOptionPubkey(buf: Buffer, offset: number): { value: string | null; size: number } {
  if (buf[offset] === 1) {
    return { value: readPubkey(buf, offset + 1), size: 33 };
  }
  return { value: null, size: 1 };
}

function readOptionU32(buf: Buffer, offset: number): { value: number | null; size: number } {
  if (buf[offset] === 1) {
    return { value: buf.readUInt32LE(offset + 1), size: 5 };
  }
  return { value: null, size: 1 };
}

function readBorshString(buf: Buffer, offset: number): { value: string; size: number } {
  const len = buf.readUInt32LE(offset);
  const str = buf.subarray(offset + 4, offset + 4 + len).toString("utf8");
  return { value: str, size: 4 + len };
}

function readBorshVecLen(buf: Buffer, offset: number): number {
  return buf.readUInt32LE(offset);
}

// ─── ArxNode ────────────────────────────────────────────────────
// IDL layout:
//   x25519_pubkey: [u8; 32]
//   primary_staking_account: pubkey
//   metadata: NodeMetadata { ip: [u8;4], peer_id: [u8;32], location: u8 }
//   config: ArxNodeConfig { authority: pubkey, callback_authority: pubkey }
//   cluster_membership: ClusterMembership enum { Inactive, Active(u32), Proposed(u32) }
//   cu_capacity_claim: u64
//   is_active: bool
//   bls_pubkey: BN254G2BLSPublicKey { [u8; 64] }
//   bump: u8

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
    if (buf.length < 248) return null;
    let off = 8; // skip discriminator

    // x25519_pubkey: [u8; 32]
    const x25519Bytes = buf.subarray(off, off + 32);
    const x25519PublicKey = x25519Bytes.some((b) => b !== 0)
      ? Buffer.from(x25519Bytes).toString("hex")
      : null;
    off += 32;

    // primary_staking_account: pubkey (skip, not stored in our DB)
    off += 32;

    // metadata.ip: [u8; 4]
    const ipBytes = buf.subarray(off, off + 4);
    const ip = `${ipBytes[0]}.${ipBytes[1]}.${ipBytes[2]}.${ipBytes[3]}`;
    off += 4;

    // metadata.peer_id: [u8; 32] (skip)
    off += 32;

    // metadata.location: u8 (skip)
    off += 1;

    // config.authority: pubkey
    const authorityKey = readPubkey(buf, off);
    off += 32;

    // config.callback_authority: pubkey (skip)
    off += 32;

    // cluster_membership: enum { Inactive(0), Active(1, u32), Proposed(2, u32) }
    let clusterOffset: number | null = null;
    const membershipVariant = buf[off];
    off += 1;
    if (membershipVariant === 1 || membershipVariant === 2) {
      clusterOffset = buf.readUInt32LE(off);
      off += 4;
    }

    // cu_capacity_claim: u64
    const cuCapacityClaim = Number(buf.readBigUInt64LE(off));
    off += 8;

    // is_active: bool
    const isActive = buf[off] === 1;
    off += 1;

    // bls_pubkey: BN254G2BLSPublicKey (unnamed struct with [u8; 64])
    const blsBytes = buf.subarray(off, off + 64);
    const blsPublicKey = blsBytes.some((b) => b !== 0)
      ? Buffer.from(blsBytes).toString("hex")
      : null;
    off += 64;

    // bump: u8 (skip)

    return {
      authorityKey,
      ip: ip === "0.0.0.0" ? null : ip,
      clusterOffset,
      cuCapacityClaim,
      isActive,
      blsPublicKey,
      x25519PublicKey,
    };
  } catch {
    return null;
  }
}

// ─── Cluster ────────────────────────────────────────────────────
// IDL layout:
//   td_info: Option<NodeMetadata> { ip: [u8;4], peer_id: [u8;32], location: u8 }
//   authority: Option<pubkey>
//   cluster_size: u16
//   activation: Activation { activation_epoch: Epoch(u64), deactivation_epoch: Epoch(u64) }
//   max_capacity: u64
//   cu_price: u64
//   cu_price_proposals: [u64; 32]
//   last_updated_epoch: Epoch(u64)
//   nodes: Vec<NodeRef { offset: u32, current_total_rewards: u64, vote: u8 }>
//   pending_nodes: Vec<u32>
//   bls_public_key: SetUnset<BN254G2BLSPublicKey>
//   bump: u8

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
    if (buf.length < 50) return null;
    let off = 8; // skip discriminator

    // td_info: Option<NodeMetadata>
    if (buf[off] === 1) {
      off += 1 + 4 + 32 + 1; // Some + ip[4] + peer_id[32] + location
    } else {
      off += 1; // None
    }

    // authority: Option<pubkey>
    const authOpt = readOptionPubkey(buf, off);
    off += authOpt.size;

    // cluster_size: u16
    const clusterSize = buf.readUInt16LE(off);
    off += 2;

    // activation: { activation_epoch: u64, deactivation_epoch: u64 }
    const activationEpoch = Number(buf.readBigUInt64LE(off));
    off += 8;
    const deactivationEpoch = Number(buf.readBigUInt64LE(off));
    off += 8;
    // Active if activation_epoch is not u64::MAX and deactivation_epoch is u64::MAX
    const U64_MAX = 18446744073709551615;
    const isActive = activationEpoch !== U64_MAX;

    // max_capacity: u64
    const maxCapacity = Number(buf.readBigUInt64LE(off));
    off += 8;

    // cu_price: u64
    const cuPrice = Number(buf.readBigUInt64LE(off));
    off += 8;

    // cu_price_proposals: [u64; 32] (256 bytes, skip)
    off += 256;

    // last_updated_epoch: Epoch (u64, skip)
    off += 8;

    // nodes: Vec<NodeRef { offset: u32, current_total_rewards: u64, vote: u8 }>
    const nodeOffsets: number[] = [];
    if (off + 4 <= buf.length) {
      const nodeCount = readBorshVecLen(buf, off);
      off += 4;
      const NODE_REF_SIZE = 4 + 8 + 1; // u32 + u64 + u8 = 13
      for (let i = 0; i < Math.min(nodeCount, 100); i++) {
        if (off + NODE_REF_SIZE > buf.length) break;
        nodeOffsets.push(buf.readUInt32LE(off));
        off += NODE_REF_SIZE;
      }
    }

    // pending_nodes: Vec<u32> (skip)
    if (off + 4 <= buf.length) {
      const pendingCount = readBorshVecLen(buf, off);
      off += 4 + pendingCount * 4;
    }

    // bls_public_key: SetUnset<BN254G2BLSPublicKey>
    //   enum variant 0 = Set([u8; 64]), variant 1 = Unset([u8; 64], Vec<bool>)
    let blsPublicKey: string | null = null;
    if (off < buf.length) {
      const variant = buf[off];
      off += 1;
      if (variant === 0 && off + 64 <= buf.length) {
        // Set variant — BLS key is the next 64 bytes
        const blsBytes = buf.subarray(off, off + 64);
        if (blsBytes.some((b) => b !== 0)) {
          blsPublicKey = Buffer.from(blsBytes).toString("hex");
        }
      }
      // Unset variant also has 64 bytes + Vec<bool>, but we don't need it
    }

    return {
      clusterSize,
      maxCapacity,
      cuPrice,
      nodeOffsets,
      isActive,
      blsPublicKey,
    };
  } catch {
    return null;
  }
}

// ─── MXE Account ────────────────────────────────────────────────
// IDL layout:
//   cluster: Option<u32>
//   keygen_offset: u64
//   key_recovery_init_offset: u64
//   mxe_program_id: pubkey
//   authority: Option<pubkey>
//   utility_pubkeys: SetUnset<UtilityPubkeys>
//   lut_offset_slot: u64
//   computation_definitions: Vec<u32>
//   status: MxeStatus enum { Active, Recovery }
//   bump: u8

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
    if (buf.length < 50) return null;
    let off = 8; // skip discriminator

    // cluster: Option<u32>
    const clusterOpt = readOptionU32(buf, off);
    const clusterOffset = clusterOpt.value;
    off += clusterOpt.size;

    // keygen_offset: u64
    off += 8;

    // key_recovery_init_offset: u64
    off += 8;

    // mxe_program_id: pubkey
    const mxeProgramId = readPubkey(buf, off);
    off += 32;

    // authority: Option<pubkey>
    const authOpt = readOptionPubkey(buf, off);
    const authority = authOpt.value;
    off += authOpt.size;

    // utility_pubkeys: SetUnset<UtilityPubkeys>
    //   Set(0) -> UtilityPubkeys { x25519: [u8;32], ed25519: [u8;32], elgamal: [u8;32], proof: [u8;64] }
    //   Unset(1) -> same + Vec<bool>
    let x25519Pubkey: string | null = null;
    if (off < buf.length) {
      const variant = buf[off];
      off += 1;
      if (variant === 0 || variant === 1) {
        // Read x25519_pubkey (first 32 bytes of UtilityPubkeys)
        if (off + 32 <= buf.length) {
          const x25519Bytes = buf.subarray(off, off + 32);
          if (x25519Bytes.some((b) => b !== 0)) {
            x25519Pubkey = Buffer.from(x25519Bytes).toString("hex");
          }
        }
        // Skip rest of UtilityPubkeys: x25519(32) + ed25519(32) + elgamal(32) + proof(64)
        off += 32 + 32 + 32 + 64;
        if (variant === 1) {
          // Unset also has Vec<bool>
          if (off + 4 <= buf.length) {
            const boolVecLen = readBorshVecLen(buf, off);
            off += 4 + boolVecLen;
          }
        }
      }
    }

    // lut_offset_slot: u64
    off += 8;

    // computation_definitions: Vec<u32>
    const compDefOffsets: number[] = [];
    if (off + 4 <= buf.length) {
      const count = readBorshVecLen(buf, off);
      off += 4;
      for (let i = 0; i < Math.min(count, 1000); i++) {
        if (off + 4 > buf.length) break;
        compDefOffsets.push(buf.readUInt32LE(off));
        off += 4;
      }
    }

    return { mxeProgramId, clusterOffset, authority, x25519Pubkey, compDefOffsets };
  } catch {
    return null;
  }
}

// ─── Computation Definition ─────────────────────────────────────
// IDL layout:
//   finalization_authority: Option<pubkey>
//   cu_amount: u64
//   definition: ComputationDefinitionMeta { circuit_len: u32, signature: ComputationSignature { parameters: Vec<Parameter>, outputs: Vec<Output> } }
//   circuit_source: CircuitSource enum { Local(LocalCircuitSource), OnChain(OnChainCircuitSource), OffChain(OffChainCircuitSource) }
//   bump: u8

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
    if (buf.length < 20) return null;
    let off = 8; // skip discriminator

    // finalization_authority: Option<pubkey>
    const finAuthOpt = readOptionPubkey(buf, off);
    off += finAuthOpt.size;

    // cu_amount: u64
    const cuAmount = Number(buf.readBigUInt64LE(off));
    off += 8;

    // definition.circuit_len: u32
    const circuitLen = buf.readUInt32LE(off);
    off += 4;

    // definition.signature: ComputationSignature { parameters: Vec<Parameter>, outputs: Vec<Output> }
    // Parameter is a simple enum (1 byte each), Output is also a simple enum (1 byte each)

    // parameters: Vec<Parameter> — each Parameter is a 1-byte enum
    if (off + 4 <= buf.length) {
      const paramCount = readBorshVecLen(buf, off);
      off += 4;
      off += paramCount; // 1 byte per parameter enum variant
    }

    // outputs: Vec<Output> — each Output is a 1-byte enum
    if (off + 4 <= buf.length) {
      const outputCount = readBorshVecLen(buf, off);
      off += 4;
      off += outputCount; // 1 byte per output enum variant
    }

    // circuit_source: CircuitSource enum
    let sourceType = "unknown";
    if (off < buf.length) {
      const variant = buf[off];
      off += 1;
      if (variant === 0) {
        sourceType = "local";
        // LocalCircuitSource is an enum (1 byte)
        off += 1;
      } else if (variant === 1) {
        sourceType = "onchain";
        // OnChainCircuitSource: { is_completed: bool, upload_auth: pubkey }
        off += 1 + 32;
      } else if (variant === 2) {
        sourceType = "offchain";
        // OffChainCircuitSource: { source: String, hash: [u8; 32] }
      }
    }

    return {
      // mxeProgramId is not in this struct — derived from MXE relationship
      mxeProgramId: finAuthOpt.value ?? "unknown",
      defOffset: 0, // not in the struct — derived from PDA seeds
      cuAmount,
      circuitLen,
      sourceType,
    };
  } catch {
    return null;
  }
}

// ─── Computation ────────────────────────────────────────────────
// IDL layout:
//   payer: pubkey
//   mxe_program_id: pubkey
//   computation_definition_offset: u32
//   execution_fee: ExecutionFee { base_fee: u64, priority_fee: u64, output_delivery_fee: u64 }
//   slot: u64
//   slot_counter: u16
//   status: ComputationStatus enum { Queued(0), Finalized(1) }
//   arguments: ArgumentList { args: Vec<ArgumentRef>, byte_arrays: Vec<[u8;32]>, plaintext_numbers: Vec<u64>, values_128_bit: Vec<u128>, accounts: Vec<AccountArgument> }
//   custom_callback_instructions: Vec<CallbackInstruction>
//   callback_transactions_required: u8
//   callback_transactions_submitted_bm: u16
//   bump: u8

export interface ParsedComputation {
  computationOffset: string;
  clusterOffset: number;
  payer: string;
  mxeProgramId: string | null;
  status: "queued" | "executing" | "finalized" | "failed";
  isScaffold: boolean;
  slot: number;
  queuedAt: Date | null;
  executingAt: Date | null;
  finalizedAt: Date | null;
  failedAt: Date | null;
}

export function parseComputationAccount(data: Buffer | Uint8Array): ParsedComputation | null {
  try {
    const buf = Buffer.from(data);
    if (buf.length < 106) return null;
    let off = 8; // skip discriminator

    // payer: pubkey
    const payer = readPubkey(buf, off);
    off += 32;

    // mxe_program_id: pubkey
    const mxeProgramId = readPubkey(buf, off);
    off += 32;

    // computation_definition_offset: u32
    const defOffset = buf.readUInt32LE(off);
    off += 4;

    // execution_fee: { base_fee: u64, priority_fee: u64, output_delivery_fee: u64 }
    off += 24; // 3 * u64

    // slot: u64 (Solana slot when computation was queued)
    const slot = Number(buf.readBigUInt64LE(off));
    off += 8;

    // slot_counter: u16
    const slotCounter = buf.readUInt16LE(off);
    off += 2;

    // status: ComputationStatus enum { Queued(0), Finalized(1) }
    const statusByte = buf[off];
    off += 1;
    const status: "queued" | "finalized" = statusByte === 1 ? "finalized" : "queued";

    // computationOffset: store comp_def_offset as string identifier
    const computationOffset = defOffset.toString();

    // Scaffold computations are created by init_mxe_part2 with payer = system program
    const isScaffold = payer === "11111111111111111111111111111111";

    return {
      computationOffset,
      clusterOffset: 0, // cluster derived via MXE join, not stored on computation
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
  } catch {
    return null;
  }
}
