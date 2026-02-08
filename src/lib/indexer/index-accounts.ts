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
import type { Network } from "@/types";

export async function indexClusters(network: Network): Promise<number> {
  const connection = getServerConnection(network);
  const accounts = await fetchAccountsByType(connection, "Cluster");
  let indexed = 0;

  for (const { pubkey, account } of accounts) {
    const parsed = parseClusterAccount(account.data);
    if (!parsed) continue;
    if (parsed.clusterSize === 0 && parsed.nodeOffsets.length === 0) continue;

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

  for (const { pubkey, account } of accounts) {
    const parsed = parseComputationAccount(account.data);
    if (!parsed) continue;

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
