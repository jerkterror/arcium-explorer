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
    queuedAt: parsed.queuedAt,
    executingAt: parsed.executingAt,
    network,
    updatedAt: new Date(),
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
