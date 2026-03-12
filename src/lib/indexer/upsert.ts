import { eq, and } from "drizzle-orm";
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

  const existing = await db
    .select({ id: schema.clusters.id, offset: schema.clusters.offset })
    .from(schema.clusters)
    .where(
      and(
        eq(schema.clusters.address, address),
        eq(schema.clusters.network, network)
      )
    )
    .limit(1);

  const data = {
    address,
    clusterSize: parsed.clusterSize,
    maxCapacity: parsed.maxCapacity,
    cuPrice: parsed.cuPrice,
    nodeOffsets: parsed.nodeOffsets,
    blsPublicKey: parsed.blsPublicKey,
    isActive: parsed.isActive,
    network,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    // If offset is still 0, try to derive it now
    const needsOffset = existing[0].offset === 0;
    const updateData = needsOffset
      ? { ...data, offset: deriveClusterOffset(address) ?? 0 }
      : data;
    await db
      .update(schema.clusters)
      .set(updateData)
      .where(eq(schema.clusters.id, existing[0].id));
  } else {
    const offset = deriveClusterOffset(address) ?? 0;
    await db.insert(schema.clusters).values({
      ...data,
      offset,
    });
  }
}

export async function upsertArxNode(
  address: string,
  parsed: ParsedArxNode,
  network: Network
): Promise<void> {
  const { db, schema } = await getDb();

  const existing = await db
    .select({ id: schema.arxNodes.id, offset: schema.arxNodes.offset })
    .from(schema.arxNodes)
    .where(
      and(
        eq(schema.arxNodes.address, address),
        eq(schema.arxNodes.network, network)
      )
    )
    .limit(1);

  const data = {
    address,
    authorityKey: parsed.authorityKey,
    ip: parsed.ip,
    clusterOffset: parsed.clusterOffset,
    cuCapacityClaim: parsed.cuCapacityClaim,
    isActive: parsed.isActive,
    blsPublicKey: parsed.blsPublicKey,
    x25519PublicKey: parsed.x25519PublicKey,
    network,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    const needsOffset = existing[0].offset === 0;
    const updateData = needsOffset
      ? { ...data, offset: deriveArxNodeOffset(address) ?? 0 }
      : data;
    await db
      .update(schema.arxNodes)
      .set(updateData)
      .where(eq(schema.arxNodes.id, existing[0].id));
  } else {
    const offset = deriveArxNodeOffset(address) ?? 0;
    await db.insert(schema.arxNodes).values({
      ...data,
      offset,
    });
  }
}

export async function upsertMXEAccount(
  address: string,
  parsed: ParsedMXEAccount,
  network: Network
): Promise<void> {
  const { db, schema } = await getDb();

  const existing = await db
    .select({ id: schema.mxeAccounts.id })
    .from(schema.mxeAccounts)
    .where(
      and(
        eq(schema.mxeAccounts.address, address),
        eq(schema.mxeAccounts.network, network)
      )
    )
    .limit(1);

  const data = {
    address,
    mxeProgramId: parsed.mxeProgramId,
    clusterOffset: parsed.clusterOffset,
    authority: parsed.authority,
    x25519Pubkey: parsed.x25519Pubkey,
    compDefOffsets: parsed.compDefOffsets,
    network,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db
      .update(schema.mxeAccounts)
      .set(data)
      .where(eq(schema.mxeAccounts.id, existing[0].id));
  } else {
    await db.insert(schema.mxeAccounts).values(data);
  }
}

export async function upsertComputationDefinition(
  address: string,
  parsed: ParsedComputationDefinition,
  network: Network
): Promise<void> {
  const { db, schema } = await getDb();

  const existing = await db
    .select({ id: schema.computationDefinitions.id })
    .from(schema.computationDefinitions)
    .where(
      and(
        eq(schema.computationDefinitions.address, address),
        eq(schema.computationDefinitions.network, network)
      )
    )
    .limit(1);

  const data = {
    address,
    mxeProgramId: parsed.mxeProgramId,
    defOffset: parsed.defOffset,
    cuAmount: parsed.cuAmount,
    circuitLen: parsed.circuitLen,
    sourceType: parsed.sourceType,
    network,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db
      .update(schema.computationDefinitions)
      .set(data)
      .where(eq(schema.computationDefinitions.id, existing[0].id));
  } else {
    await db.insert(schema.computationDefinitions).values(data);
  }
}

export async function upsertComputation(
  address: string,
  parsed: ParsedComputation,
  network: Network
): Promise<void> {
  const { db, schema } = await getDb();

  const existing = await db
    .select({ id: schema.computations.id })
    .from(schema.computations)
    .where(
      and(
        eq(schema.computations.address, address),
        eq(schema.computations.network, network)
      )
    )
    .limit(1);

  const data = {
    address,
    computationOffset: parsed.computationOffset,
    clusterOffset: parsed.clusterOffset,
    payer: parsed.payer,
    mxeProgramId: parsed.mxeProgramId,
    status: parsed.status,
    isScaffold: parsed.isScaffold,
    queuedAt: parsed.queuedAt,
    executingAt: parsed.executingAt,
    finalizedAt: parsed.finalizedAt,
    failedAt: parsed.failedAt,
    network,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db
      .update(schema.computations)
      .set(data)
      .where(eq(schema.computations.id, existing[0].id));
  } else {
    await db.insert(schema.computations).values(data);
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

  const existing = await db
    .select({ id: schema.programs.id })
    .from(schema.programs)
    .where(
      and(
        eq(schema.programs.programId, programId),
        eq(schema.programs.network, network)
      )
    )
    .limit(1);

  const data = {
    programId,
    mxeAddress,
    compDefCount,
    computationCount,
    network,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db
      .update(schema.programs)
      .set(data)
      .where(eq(schema.programs.id, existing[0].id));
  } else {
    await db.insert(schema.programs).values(data);
  }
}
