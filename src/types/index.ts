export type Network = "devnet" | "mainnet";

export type ComputationStatus = "queued" | "executing" | "finalized" | "failed";

export interface Cluster {
  id: number;
  address: string;
  offset: number;
  clusterSize: number;
  maxCapacity: number;
  cuPrice: number;
  nodeOffsets: number[];
  blsPublicKey: string | null;
  isActive: boolean;
  network: Network;
  createdAt: string;
  updatedAt: string;
}

export interface ArxNode {
  id: number;
  address: string;
  offset: number;
  authorityKey: string;
  ip: string | null;
  location: string | null;
  clusterOffset: number | null;
  cuCapacityClaim: number;
  isActive: boolean;
  blsPublicKey: string | null;
  x25519PublicKey: string | null;
  network: Network;
  createdAt: string;
  updatedAt: string;
}

export interface MxeAccount {
  id: number;
  address: string;
  mxeProgramId: string;
  clusterOffset: number | null;
  authority: string | null;
  x25519Pubkey: string | null;
  compDefOffsets: number[];
  status: string;
  network: Network;
  createdAt: string;
  updatedAt: string;
}

export interface ComputationDefinition {
  id: number;
  address: string;
  mxeProgramId: string;
  defOffset: number;
  cuAmount: number;
  circuitLen: number;
  sourceType: string;
  isCompleted: boolean;
  parameters: Record<string, unknown> | null;
  outputs: Record<string, unknown> | null;
  network: Network;
  createdAt: string;
  updatedAt: string;
}

export interface Computation {
  id: number;
  address: string;
  computationOffset: string;
  clusterOffset: number;
  payer: string;
  mxeProgramId: string | null;
  status: ComputationStatus;
  isScaffold: boolean;
  queuedAt: string | null;
  executingAt: string | null;
  finalizedAt: string | null;
  failedAt: string | null;
  queueTxSig: string | null;
  finalizeTxSig: string | null;
  network: Network;
  createdAt: string;
  updatedAt: string;
}

export interface Program {
  id: number;
  programId: string;
  mxeAddress: string;
  compDefCount: number;
  computationCount: number;
  network: Network;
  createdAt: string;
  updatedAt: string;
}

export interface NetworkSnapshot {
  id: number;
  timestamp: string;
  totalClusters: number;
  activeNodes: number;
  totalComputations: number;
  computationsPerMin: number;
  network: Network;
}

export interface NetworkStats {
  totalClusters: number;
  activeNodes: number;
  totalComputations: number;
  queuedComputations: number;
  executingComputations: number;
  finalizedComputations: number;
  totalPrograms: number;
  totalMxes: number;
  network: Network;
}

export interface ApiResponse<T> {
  data: T;
  meta: {
    network: Network;
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  network?: Network;
}
