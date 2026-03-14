import { eq, and, sql } from "drizzle-orm";
import type { Network } from "@/types";
import { deriveClusterOffset, deriveArxNodeOffset } from "@/lib/solana/pda";
import type {
  ParsedCluster,
  ParsedArxNode,
  ParsedMXEAccount,
  ParsedComputationDefinition,
  ParsedComputation,
} from "./parsers";

// Lazy db import to avoid errors when DATABASE_URL is missing at build time
async function getDb() {
  const { db } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  return { db, schema };
}

export async function upsertCluster(
  address: string,
  parsed: ParsedCluster,
  network: Network
): Promise<void> {
  const { db, schema } = await getDb();

  const derivedOffset = deriveClusterOffset(address) ?? 0;

  await db
    .insert(schema.clusters)
    .values({
      address,
      offset: derivedOffset,
      clusterSize: parsed.clusterSize,
      maxCapacity: parsed.maxCapacity,
      cuPrice: parsed.cuPrice,
      nodeOffsets: parsed.nodeOffsets,
      blsPublicKey: parsed.blsPublicKey,
      isActive: parsed.isActive,
      network,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.clusters.address, schema.clusters.network],
      set: {
        clusterSize: parsed.clusterSize,
        maxCapacity: parsed.maxCapacity,
        cuPrice: parsed.cuPrice,
        nodeOffsets: parsed.nodeOffsets,
        blsPublicKey: parsed.blsPublicKey,
        isActive: parsed.isActive,
        // Preserve existing offset if non-zero; otherwise use derived
        offset: sql`CASE WHEN ${schema.clusters.offset} != 0 THEN ${schema.clusters.offset} ELSE ${derivedOffset} END`,
        updatedAt: new Date(),
      },
    });
}

export async function upsertArxNode(
  address: string,
  parsed: ParsedArxNode,
  network: Network
): Promise<void> {
  const { db, schema } = await getDb();

  const derivedOffset = deriveArxNodeOffset(address) ?? 0;

  await db
    .insert(schema.arxNodes)
    .values({
      address,
      offset: derivedOffset,
      authorityKey: parsed.authorityKey,
      ip: parsed.ip,
      clusterOffset: parsed.clusterOffset,
      cuCapacityClaim: parsed.cuCapacityClaim,
      isActive: parsed.isActive,
      blsPublicKey: parsed.blsPublicKey,
      x25519PublicKey: parsed.x25519PublicKey,
      network,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.arxNodes.address, schema.arxNodes.network],
      set: {
        authorityKey: parsed.authorityKey,
        ip: parsed.ip,
        clusterOffset: parsed.clusterOffset,
        cuCapacityClaim: parsed.cuCapacityClaim,
        isActive: parsed.isActive,
        blsPublicKey: parsed.blsPublicKey,
        x25519PublicKey: parsed.x25519PublicKey,
        // Preserve existing offset if non-zero; otherwise use derived
        offset: sql`CASE WHEN ${schema.arxNodes.offset} != 0 THEN ${schema.arxNodes.offset} ELSE ${derivedOffset} END`,
        updatedAt: new Date(),
      },
    });
}

export async function upsertMXEAccount(
  address: string,
  parsed: ParsedMXEAccount,
  network: Network
): Promise<void> {
  const { db, schema } = await getDb();

  await db
    .insert(schema.mxeAccounts)
    .values({
      address,
      mxeProgramId: parsed.mxeProgramId,
      clusterOffset: parsed.clusterOffset,
      authority: parsed.authority,
      x25519Pubkey: parsed.x25519Pubkey,
      compDefOffsets: parsed.compDefOffsets,
      network,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.mxeAccounts.address, schema.mxeAccounts.network],
      set: {
        mxeProgramId: parsed.mxeProgramId,
        clusterOffset: parsed.clusterOffset,
        authority: parsed.authority,
        x25519Pubkey: parsed.x25519Pubkey,
        compDefOffsets: parsed.compDefOffsets,
        updatedAt: new Date(),
      },
    });
}

export async function upsertComputationDefinition(
  address: string,
  parsed: ParsedComputationDefinition,
  network: Network
): Promise<void> {
  const { db, schema } = await getDb();

  await db
    .insert(schema.computationDefinitions)
    .values({
      address,
      mxeProgramId: parsed.mxeProgramId,
      defOffset: parsed.defOffset,
      cuAmount: parsed.cuAmount,
      circuitLen: parsed.circuitLen,
      sourceType: parsed.sourceType,
      network,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.computationDefinitions.address, schema.computationDefinitions.network],
      set: {
        mxeProgramId: parsed.mxeProgramId,
        defOffset: parsed.defOffset,
        cuAmount: parsed.cuAmount,
        circuitLen: parsed.circuitLen,
        sourceType: parsed.sourceType,
        updatedAt: new Date(),
      },
    });
}

export async function upsertComputation(
  address: string,
  parsed: ParsedComputation,
  network: Network
): Promise<void> {
  const { db, schema } = await getDb();

  // Resolve cluster offset from MXE account if the parser couldn't determine it
  let clusterOffset = parsed.clusterOffset;
  if (clusterOffset === 0 && parsed.mxeProgramId) {
    const [mxe] = await db
      .select({ clusterOffset: schema.mxeAccounts.clusterOffset })
      .from(schema.mxeAccounts)
      .where(
        and(
          eq(schema.mxeAccounts.mxeProgramId, parsed.mxeProgramId),
          eq(schema.mxeAccounts.network, network)
        )
      )
      .limit(1);
    if (mxe?.clusterOffset) {
      clusterOffset = mxe.clusterOffset;
    }
  }

  const existing = await db
    .select({
      id: schema.computations.id,
      clusterOffset: schema.computations.clusterOffset,
      status: schema.computations.status,
      callbackErrorCode: schema.computations.callbackErrorCode,
    })
    .from(schema.computations)
    .where(
      and(
        eq(schema.computations.address, address),
        eq(schema.computations.network, network)
      )
    )
    .limit(1);

  const baseData = {
    address,
    computationOffset: parsed.computationOffset,
    clusterOffset,
    payer: parsed.payer,
    mxeProgramId: parsed.mxeProgramId,
    isScaffold: parsed.isScaffold,
    executingAt: parsed.executingAt,
    network,
    updatedAt: new Date(),
    // Only overwrite queuedAt if the parser actually resolved it;
    // gRPC/WS subscribers pass null and would erase enricher-set timestamps
    ...(parsed.queuedAt ? { queuedAt: parsed.queuedAt } : {}),
  };

  if (existing.length > 0) {
    const row = existing[0];
    // Preserve enricher-corrected status: the tx-enricher may have set status
    // to "failed" (with callbackErrorCode) based on tx analysis. The on-chain
    // account status stays "Queued" after a failed callback (tx rolled back),
    // so the indexer would otherwise overwrite the corrected status.
    const preserveStatus =
      row.status === "failed" ||
      row.callbackErrorCode !== null ||
      (row.status === "finalized" && parsed.status === "queued");

    const updateData = preserveStatus
      ? { ...baseData }
      : {
          ...baseData,
          status: parsed.status,
          finalizedAt: parsed.finalizedAt,
          failedAt: parsed.failedAt,
        };

    await db
      .update(schema.computations)
      .set(updateData)
      .where(eq(schema.computations.id, row.id));
  } else {
    await db.insert(schema.computations).values({
      ...baseData,
      status: parsed.status,
      finalizedAt: parsed.finalizedAt,
      failedAt: parsed.failedAt,
    });
  }
}

export async function upsertProgram(
  programId: string,
  mxeAddress: string,
  network: Network,
  compDefCount: number,
  computationCount: number
): Promise<void> {
  const { db, schema } = await getDb();

  await db
    .insert(schema.programs)
    .values({
      programId,
      mxeAddress,
      compDefCount,
      computationCount,
      network,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.programs.programId, schema.programs.network],
      set: {
        mxeAddress,
        compDefCount,
        computationCount,
        updatedAt: new Date(),
      },
    });
}
