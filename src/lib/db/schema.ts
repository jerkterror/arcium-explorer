import {
  pgTable,
  serial,
  varchar,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
  real,
  text,
} from "drizzle-orm/pg-core";

export const networkEnum = pgEnum("network", ["devnet", "mainnet"]);
export const computationStatusEnum = pgEnum("computation_status", [
  "queued",
  "executing",
  "finalized",
  "failed",
]);

// ─── Clusters ────────────────────────────────────────────────────

export const clusters = pgTable(
  "clusters",
  {
    id: serial("id").primaryKey(),
    address: varchar("address", { length: 64 }).notNull(),
    offset: bigint("offset", { mode: "number" }).notNull(),
    clusterSize: integer("cluster_size").notNull().default(0),
    maxCapacity: bigint("max_capacity", { mode: "number" }).notNull().default(0),
    cuPrice: bigint("cu_price", { mode: "number" }).notNull().default(0),
    nodeOffsets: jsonb("node_offsets").$type<number[]>().default([]),
    blsPublicKey: varchar("bls_public_key", { length: 256 }),
    isActive: boolean("is_active").notNull().default(false),
    network: networkEnum("network").notNull().default("devnet"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("clusters_address_network_idx").on(table.address, table.network),
    index("clusters_network_idx").on(table.network),
    index("clusters_active_idx").on(table.isActive, table.network),
  ]
);

// ─── ARX Nodes ───────────────────────────────────────────────────

export const arxNodes = pgTable(
  "arx_nodes",
  {
    id: serial("id").primaryKey(),
    address: varchar("address", { length: 64 }).notNull(),
    offset: bigint("offset", { mode: "number" }).notNull(),
    authorityKey: varchar("authority_key", { length: 64 }).notNull(),
    ip: varchar("ip", { length: 64 }),
    location: varchar("location", { length: 128 }),
    clusterOffset: bigint("cluster_offset", { mode: "number" }),
    cuCapacityClaim: bigint("cu_capacity_claim", { mode: "number" }).notNull().default(0),
    isActive: boolean("is_active").notNull().default(false),
    blsPublicKey: varchar("bls_public_key", { length: 256 }),
    x25519PublicKey: varchar("x25519_public_key", { length: 128 }),
    network: networkEnum("network").notNull().default("devnet"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("arx_nodes_address_network_idx").on(table.address, table.network),
    index("arx_nodes_network_idx").on(table.network),
    index("arx_nodes_cluster_idx").on(table.clusterOffset, table.network),
    index("arx_nodes_active_idx").on(table.isActive, table.network),
  ]
);

// ─── MXE Accounts ────────────────────────────────────────────────

export const mxeAccounts = pgTable(
  "mxe_accounts",
  {
    id: serial("id").primaryKey(),
    address: varchar("address", { length: 64 }).notNull(),
    mxeProgramId: varchar("mxe_program_id", { length: 64 }).notNull(),
    clusterOffset: bigint("cluster_offset", { mode: "number" }),
    authority: varchar("authority", { length: 64 }),
    x25519Pubkey: varchar("x25519_pubkey", { length: 128 }),
    compDefOffsets: jsonb("comp_def_offsets").$type<number[]>().default([]),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    network: networkEnum("network").notNull().default("devnet"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("mxe_accounts_address_network_idx").on(table.address, table.network),
    index("mxe_accounts_program_idx").on(table.mxeProgramId, table.network),
    index("mxe_accounts_network_idx").on(table.network),
  ]
);

// ─── Computation Definitions ─────────────────────────────────────

export const computationDefinitions = pgTable(
  "computation_definitions",
  {
    id: serial("id").primaryKey(),
    address: varchar("address", { length: 64 }).notNull(),
    mxeProgramId: varchar("mxe_program_id", { length: 64 }).notNull(),
    defOffset: bigint("def_offset", { mode: "number" }).notNull(),
    cuAmount: bigint("cu_amount", { mode: "number" }).notNull().default(0),
    circuitLen: bigint("circuit_len", { mode: "number" }).notNull().default(0),
    sourceType: varchar("source_type", { length: 32 }).notNull().default("onchain"),
    isCompleted: boolean("is_completed").notNull().default(false),
    parameters: jsonb("parameters").$type<Record<string, unknown>>(),
    outputs: jsonb("outputs").$type<Record<string, unknown>>(),
    network: networkEnum("network").notNull().default("devnet"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("comp_defs_address_network_idx").on(table.address, table.network),
    index("comp_defs_program_idx").on(table.mxeProgramId, table.network),
    index("comp_defs_network_idx").on(table.network),
  ]
);

// ─── Computations ────────────────────────────────────────────────

export const computations = pgTable(
  "computations",
  {
    id: serial("id").primaryKey(),
    address: varchar("address", { length: 64 }).notNull(),
    computationOffset: varchar("computation_offset", { length: 32 }).notNull(),
    clusterOffset: bigint("cluster_offset", { mode: "number" }).notNull(),
    payer: varchar("payer", { length: 64 }).notNull(),
    mxeProgramId: varchar("mxe_program_id", { length: 64 }),
    status: computationStatusEnum("status").notNull().default("queued"),
    isScaffold: boolean("is_scaffold").notNull().default(false),
    queuedAt: timestamp("queued_at"),
    executingAt: timestamp("executing_at"),
    finalizedAt: timestamp("finalized_at"),
    failedAt: timestamp("failed_at"),
    queueTxSig: varchar("queue_tx_sig", { length: 128 }),
    finalizeTxSig: varchar("finalize_tx_sig", { length: 128 }),
    network: networkEnum("network").notNull().default("devnet"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("computations_address_network_idx").on(table.address, table.network),
    index("computations_status_idx").on(table.status, table.network),
    index("computations_cluster_idx").on(table.clusterOffset, table.network),
    index("computations_payer_idx").on(table.payer, table.network),
    index("computations_program_idx").on(table.mxeProgramId, table.network),
    index("computations_network_idx").on(table.network),
    index("computations_scaffold_idx").on(table.isScaffold, table.network),
  ]
);

// ─── Programs (aggregated view) ──────────────────────────────────

export const programs = pgTable(
  "programs",
  {
    id: serial("id").primaryKey(),
    programId: varchar("program_id", { length: 64 }).notNull(),
    mxeAddress: varchar("mxe_address", { length: 64 }).notNull(),
    compDefCount: integer("comp_def_count").notNull().default(0),
    computationCount: integer("computation_count").notNull().default(0),
    network: networkEnum("network").notNull().default("devnet"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("programs_id_network_idx").on(table.programId, table.network),
    index("programs_network_idx").on(table.network),
  ]
);

// ─── Network Snapshots (time-series) ─────────────────────────────

export const networkSnapshots = pgTable(
  "network_snapshots",
  {
    id: serial("id").primaryKey(),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
    totalClusters: integer("total_clusters").notNull().default(0),
    activeNodes: integer("active_nodes").notNull().default(0),
    totalComputations: integer("total_computations").notNull().default(0),
    computationsPerMin: real("computations_per_min").notNull().default(0),
    network: networkEnum("network").notNull().default("devnet"),
  },
  (table) => [
    index("snapshots_time_idx").on(table.timestamp, table.network),
    index("snapshots_network_idx").on(table.network),
  ]
);

// ─── Indexer State ───────────────────────────────────────────────

export const indexerState = pgTable(
  "indexer_state",
  {
    id: serial("id").primaryKey(),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    lastProcessedSlot: bigint("last_processed_slot", { mode: "number" }).notNull().default(0),
    status: varchar("status", { length: 32 }).notNull().default("idle"),
    lastRunAt: timestamp("last_run_at"),
    errorMessage: text("error_message"),
    network: networkEnum("network").notNull().default("devnet"),
  },
  (table) => [
    uniqueIndex("indexer_state_entity_network_idx").on(table.entityType, table.network),
  ]
);
