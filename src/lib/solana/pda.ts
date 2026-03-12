import { PublicKey } from "@solana/web3.js";
import { ARCIUM_PROGRAM_ID } from "@/lib/constants";

const ARCIUM_PROGRAM = new PublicKey(ARCIUM_PROGRAM_ID);

// Max offset to try when reverse-deriving PDA seeds.
// Arcium offsets are sequential u32s; 100k covers all known clusters/nodes.
const MAX_OFFSET_SEARCH = 100_000;

export function getClusterAddress(offset: number): PublicKey {
  const offsetBuffer = Buffer.alloc(4);
  offsetBuffer.writeUInt32LE(offset);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("Cluster"), offsetBuffer],
    ARCIUM_PROGRAM
  );
  return pda;
}

/**
 * Reverse-derive the cluster offset from a PDA address by brute-forcing
 * the u32 seed space. Returns the offset or null if not found.
 */
export function deriveClusterOffset(address: string): number | null {
  const target = address;
  const seed = Buffer.from("Cluster");
  const offsetBuf = Buffer.alloc(4);
  for (let i = 0; i <= MAX_OFFSET_SEARCH; i++) {
    offsetBuf.writeUInt32LE(i);
    const [pda] = PublicKey.findProgramAddressSync(
      [seed, offsetBuf],
      ARCIUM_PROGRAM
    );
    if (pda.toBase58() === target) return i;
  }
  return null;
}

/**
 * Reverse-derive the ARX node offset from a PDA address.
 */
export function deriveArxNodeOffset(address: string): number | null {
  const target = address;
  const seed = Buffer.from("ArxNode");
  const offsetBuf = Buffer.alloc(4);
  for (let i = 0; i <= MAX_OFFSET_SEARCH; i++) {
    offsetBuf.writeUInt32LE(i);
    const [pda] = PublicKey.findProgramAddressSync(
      [seed, offsetBuf],
      ARCIUM_PROGRAM
    );
    if (pda.toBase58() === target) return i;
  }
  return null;
}

export function getMempoolAddress(clusterOffset: number): PublicKey {
  const offsetBuffer = Buffer.alloc(4);
  offsetBuffer.writeUInt32LE(clusterOffset);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("Mempool"), offsetBuffer],
    ARCIUM_PROGRAM
  );
  return pda;
}

export function getExecutingPoolAddress(clusterOffset: number): PublicKey {
  const offsetBuffer = Buffer.alloc(4);
  offsetBuffer.writeUInt32LE(clusterOffset);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ExecutingPool"), offsetBuffer],
    ARCIUM_PROGRAM
  );
  return pda;
}

export function getMXEAddress(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("MXEAccount"), programId.toBuffer()],
    ARCIUM_PROGRAM
  );
  return pda;
}

export function getCompDefAddress(
  programId: PublicKey,
  defOffset: number
): PublicKey {
  const offsetBuffer = Buffer.alloc(4);
  offsetBuffer.writeUInt32LE(defOffset);
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("ComputationDefinitionAccount"),
      programId.toBuffer(),
      offsetBuffer,
    ],
    ARCIUM_PROGRAM
  );
  return pda;
}

export function getComputationAddress(
  clusterOffset: number,
  computationOffset: bigint | number
): PublicKey {
  const clusterBuffer = Buffer.alloc(4);
  clusterBuffer.writeUInt32LE(clusterOffset);
  const compBuffer = Buffer.alloc(8);
  compBuffer.writeBigUInt64LE(BigInt(computationOffset));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationAccount"), clusterBuffer, compBuffer],
    ARCIUM_PROGRAM
  );
  return pda;
}
