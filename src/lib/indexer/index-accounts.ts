import { getServerConnection } from "@/lib/solana/connection";
import { fetchAccountsByType } from "./account-reader";
import {
  parseClusterAccount,
  parseArxNodeAccount,
  parseMXEAccount,
  parseComputationDefinitionAccount,
  parseComputationAccount,
} from "./parsers";
import {
  upsertCluster,
  upsertArxNode,
  upsertMXEAccount,
  upsertComputationDefinition,
  upsertComputation,
} from "./upsert";
import { eq, and } from "drizzle-orm";
import type { Network } from "@/types";

export async function indexClusters(network: Network): Promise<number> {
  const connection = getServerConnection(network);
  const accounts = await fetchAccountsByType(connection, "Cluster");
  let indexed = 0;

  for (const { pubkey, account } of accounts) {
    const parsed = parseClusterAccount(account.data);
    if (!parsed) continue;

    await upsertCluster(pubkey.toBase58(), parsed, network);
    indexed++;
  }

  return indexed;
}

export async function indexArxNodes(network: Network): Promise<number> {
  const connection = getServerConnection(network);
  const accounts = await fetchAccountsByType(connection, "ArxNode");
  let indexed = 0;

  for (const { pubkey, account } of accounts) {
    const parsed = parseArxNodeAccount(account.data);
    if (!parsed) continue;
    if (!parsed.authorityKey) continue;

    await upsertArxNode(pubkey.toBase58(), parsed, network);
    indexed++;
  }

  return indexed;
}

export async function indexMXEAccounts(network: Network): Promise<number> {
  const connection = getServerConnection(network);
  const accounts = await fetchAccountsByType(connection, "MXEAccount");
  let indexed = 0;

  for (const { pubkey, account } of accounts) {
    const parsed = parseMXEAccount(account.data);
    if (!parsed) continue;

    await upsertMXEAccount(pubkey.toBase58(), parsed, network);
    indexed++;
  }

  return indexed;
}

export async function indexComputationDefinitions(network: Network): Promise<number> {
  const connection = getServerConnection(network);
  const accounts = await fetchAccountsByType(connection, "ComputationDefinitionAccount");
  let indexed = 0;

  for (const { pubkey, account } of accounts) {
    const parsed = parseComputationDefinitionAccount(account.data);
    if (!parsed) continue;

    await upsertComputationDefinition(pubkey.toBase58(), parsed, network);
    indexed++;
  }

  return indexed;
}

export async function indexComputations(network: Network): Promise<number> {
  const connection = getServerConnection(network);
  const accounts = await fetchAccountsByType(connection, "ComputationAccount");
  let indexed = 0;

  // Cache slot→timestamp and mxeProgramId→clusterOffset
  const slotTimeCache = new Map<number, Date | null>();
  const clusterOffsetCache = new Map<string, number | null>();

  for (const { pubkey, account } of accounts) {
    const parsed = parseComputationAccount(account.data);
    if (!parsed) continue;

    // Resolve slot to on-chain timestamp
    if (parsed.slot > 0 && !parsed.queuedAt) {
      if (!slotTimeCache.has(parsed.slot)) {
        try {
          const blockTime = await connection.getBlockTime(parsed.slot);
          slotTimeCache.set(
            parsed.slot,
            blockTime ? new Date(blockTime * 1000) : null
          );
        } catch {
          slotTimeCache.set(parsed.slot, null);
        }
      }
      parsed.queuedAt = slotTimeCache.get(parsed.slot) ?? null;
    }

    // Resolve clusterOffset from MXE account
    if (parsed.mxeProgramId && parsed.clusterOffset === 0) {
      if (!clusterOffsetCache.has(parsed.mxeProgramId)) {
        try {
          const { db } = await import("@/lib/db");
          const schema = await import("@/lib/db/schema");
          const mxe = await db
            .select({ clusterOffset: schema.mxeAccounts.clusterOffset })
            .from(schema.mxeAccounts)
            .where(
              and(
                eq(schema.mxeAccounts.mxeProgramId, parsed.mxeProgramId),
                eq(schema.mxeAccounts.network, network)
              )
            )
            .limit(1);
          clusterOffsetCache.set(
            parsed.mxeProgramId,
            mxe[0]?.clusterOffset ?? null
          );
        } catch {
          clusterOffsetCache.set(parsed.mxeProgramId, null);
        }
      }
      const offset = clusterOffsetCache.get(parsed.mxeProgramId);
      if (offset !== null && offset !== undefined) {
        parsed.clusterOffset = offset;
      }
    }

    await upsertComputation(pubkey.toBase58(), parsed, network);
    indexed++;
  }

  return indexed;
}

export async function indexAll(network: Network) {
  const startTime = Date.now();
  const results = {
    clusters: 0,
    nodes: 0,
    mxeAccounts: 0,
    computationDefs: 0,
    computations: 0,
    duration: 0,
  };

  try {
    results.clusters = await indexClusters(network);
    results.nodes = await indexArxNodes(network);
    results.mxeAccounts = await indexMXEAccounts(network);
    results.computationDefs = await indexComputationDefinitions(network);
    results.computations = await indexComputations(network);
  } catch (error) {
    console.error(`Indexer error for ${network}:`, error);
    throw error;
  }

  results.duration = Date.now() - startTime;
  return results;
}
