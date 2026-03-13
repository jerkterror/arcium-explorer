# Arcium Explorer — Complete System Documentation

> This document is optimized for LLM consumption. It describes every layer of the Arcium Explorer codebase — from on-chain data ingestion through database storage to frontend rendering.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [Directory Structure](#3-directory-structure)
4. [Domain Model — What Arcium Is](#4-domain-model--what-arcium-is)
5. [Database Schema](#5-database-schema)
6. [Worker / Indexer System](#6-worker--indexer-system)
7. [On-Chain Account Parsing](#7-on-chain-account-parsing)
8. [API Layer](#8-api-layer)
9. [Frontend Pages](#9-frontend-pages)
10. [Shared Components](#10-shared-components)
11. [Hooks & Client Data Fetching](#11-hooks--client-data-fetching)
12. [Styling & Theme](#12-styling--theme)
13. [Configuration Files](#13-configuration-files)
14. [Deployment & Infrastructure](#14-deployment--infrastructure)
15. [Known Gotchas](#15-known-gotchas)

---

## 1. System Overview

The Arcium Explorer is a web application that indexes, stores, and visualizes data from the **Arcium MPC (Multi-Party Computation) network** running on Solana. It is structurally similar to a blockchain explorer (like Solscan or etherscan), but specialized for Arcium protocol entities: clusters, ARX nodes, computations, MXEs, programs, and computation definitions.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Solana Blockchain                           │
│  (Arcium Program: Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ) │
└───────┬──────────────────────────┬──────────────────────────────┘
        │                          │
   [Mainnet]                  [Devnet]
        │                          │
   gRPC Stream              WebSocket Sub
   (GrpcSubscriber)          (WsSubscriber)
        │                          │
        ├── Polling Fallback ──────┤
        │   (PollingIndexer)       │
        │                          │
        └──────────┬───────────────┘
                   │
          AccountProcessor
          (identify → parse → upsert)
                   │
        ┌──────────▼───────────┐
        │     PostgreSQL       │
        │  (single DB, network │
        │   column per row)    │
        └──────────┬───────────┘
                   │
        ┌──────────▼───────────┐
        │   Next.js 16 App     │
        │   (API Routes +      │
        │    React Frontend)   │
        └──────────────────────┘
```

### Two Runtime Processes

| Process | Entry Point | Purpose |
|---------|------------|---------|
| **Next.js App** | `npm run dev` / `npm run build && npm start` | Serves pages + API routes |
| **Worker** | `npm run worker` (tsx `worker/main.ts`) | Indexes on-chain data into PostgreSQL |

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| UI | React | 19.2.3 |
| Language | TypeScript (strict) | 5.x |
| Styling | Tailwind CSS v4 | 4.x |
| Database | PostgreSQL + Drizzle ORM | 0.45.1 |
| DB Driver | postgres.js | 3.4.8 |
| Data Fetching | TanStack Query (React Query) | 5.90.20 |
| Tables | TanStack Table | 8.21.3 |
| Charts | Recharts | 3.7.0 |
| Icons | Lucide React | 0.563.0 |
| Blockchain | @solana/web3.js | 1.98.4 |
| gRPC | @triton-one/yellowstone-grpc | 5.0.2 |
| Fonts | Inter (Google Fonts, 5 weights) | next/font/google |

---

## 3. Directory Structure

```
arcium-explorer/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout (fonts, providers, header/footer)
│   │   ├── page.tsx                  # Dashboard (/)
│   │   ├── globals.css               # Tailwind theme + CSS variables
│   │   ├── computations/
│   │   │   ├── page.tsx              # List view (/computations)
│   │   │   └── [id]/page.tsx         # Detail view (/computations/:id)
│   │   ├── clusters/
│   │   │   ├── page.tsx              # List (/clusters)
│   │   │   └── [offset]/page.tsx     # Detail (/clusters/:offset)
│   │   ├── nodes/
│   │   │   ├── page.tsx              # List (/nodes)
│   │   │   └── [offset]/page.tsx     # Detail (/nodes/:offset)
│   │   ├── programs/
│   │   │   ├── page.tsx              # List (/programs)
│   │   │   └── [address]/page.tsx    # Detail (/programs/:address)
│   │   ├── definitions/
│   │   │   ├── page.tsx              # List (/definitions)
│   │   │   └── [address]/page.tsx    # Detail (/definitions/:address)
│   │   ├── mxes/
│   │   │   ├── page.tsx              # List (/mxes)
│   │   │   └── [address]/page.tsx    # Detail (/mxes/:address)
│   │   ├── search/page.tsx           # Search results (/search?q=)
│   │   └── api/v1/
│   │       ├── stats/
│   │       │   ├── route.ts      # GET /api/v1/stats (2 queries, cached 30s)
│   │       │   └── history/route.ts  # GET /api/v1/stats/history (cached 60s)
│   │       ├── computations/
│   │       │   ├── route.ts      # GET /api/v1/computations
│   │       │   └── [id]/route.ts # GET /api/v1/computations/:id
│   │           ├── clusters/
│   │           │   ├── route.ts      # GET /api/v1/clusters
│   │           │   └── [offset]/route.ts
│   │           ├── nodes/
│   │           │   ├── route.ts      # GET /api/v1/nodes
│   │           │   └── [offset]/route.ts
│   │           ├── programs/
│   │           │   ├── route.ts      # GET /api/v1/programs
│   │           │   └── [address]/route.ts
│   │           ├── definitions/
│   │           │   ├── route.ts      # GET /api/v1/definitions
│   │           │   └── [address]/route.ts
│   │           ├── mxes/
│   │           │   ├── route.ts      # GET /api/v1/mxes
│   │           │   └── [address]/route.ts
│   │           └── search/route.ts   # GET /api/v1/search?q=
│   ├── components/
│   │   ├── providers.tsx             # TanStack QueryClientProvider
│   │   ├── layout/
│   │   │   ├── header.tsx            # Nav bar + search + network toggle
│   │   │   └── footer.tsx            # Footer links
│   │   └── shared/
│   │       ├── status-badge.tsx      # Status pill (queued/executing/finalized/failed/active/inactive)
│   │       ├── address-display.tsx   # Truncated address + copy + Solscan link
│   │       ├── metric-card.tsx       # KPI card (label + value + optional trend)
│   │       ├── data-table.tsx        # TanStack Table wrapper (sort + paginate + row click)
│   │       ├── computation-grid.tsx  # DOM grid with Q/C phase tiles + hover tooltips
│   │       ├── throughput-chart.tsx   # Recharts area chart (computations/min over time)
│   │       └── live-feed.tsx         # SSE-powered real-time computation feed
│   ├── lib/
│   │   ├── constants.ts              # Program ID, RPC endpoints, status colors
│   │   ├── utils.ts                  # cn(), truncateAddress(), formatNumber(), timeAgo()
│   │   ├── api-helpers.ts            # getNetwork(), getPagination(), jsonResponse()
│   │   ├── db/
│   │   │   ├── index.ts              # Drizzle client init (postgres.js, pool: 10)
│   │   │   └── schema.ts             # 8 tables + 2 enums (full PostgreSQL schema)
│   │   ├── solana/
│   │   │   ├── connection.ts         # Connection caching + server connection factory
│   │   │   └── pda.ts               # PDA derivation (Cluster, Mempool, MXE, CompDef, Computation)
│   │   ├── indexer/
│   │   │   ├── discriminators.ts     # Anchor discriminator computation + matching
│   │   │   ├── account-reader.ts     # getProgramAccounts with discriminator filters
│   │   │   ├── parsers.ts           # Borsh deserialization (5 account types)
│   │   │   ├── upsert.ts            # DB insert/update (lazy db import)
│   │   │   └── index-accounts.ts    # Orchestration: indexAll() calls per-type indexers
│   │   └── hooks/
│   │       ├── use-network.ts        # Read network from URL search params
│   │       └── use-api.ts           # 20+ TanStack Query hooks for every API endpoint
│   └── types/
│       └── index.ts                  # TypeScript interfaces (Cluster, ArxNode, Computation, etc.)
├── worker/
│   ├── main.ts                       # Worker entry point (orchestrates all services)
│   ├── grpc-subscriber.ts            # Yellowstone gRPC stream (mainnet)
│   ├── ws-subscriber.ts              # WebSocket subscription (devnet)
│   ├── polling-indexer.ts            # Fallback: periodic getProgramAccounts
│   ├── account-processor.ts          # Identify + parse + upsert pipeline
│   ├── tx-enricher.ts                # Backfill transaction signatures
│   ├── snapshot-writer.ts            # Periodic network stats + program aggregation
│   ├── logger.ts                     # Structured logger (debug/info/warn/error)
│   └── tsconfig.json                 # Worker-specific TypeScript config
├── drizzle/                          # Generated SQL migrations
├── ref/                              # Gitignored reference materials
│   ├── arcium_idl.json               # Arcium IDL (11,152 lines)
│   ├── arcium-docs-compiled.md       # Compiled Arcium documentation
│   └── *.mjs                         # Debug/investigation scripts
├── public/                           # Static assets (favicon, SVGs)
├── src/fonts/                        # Custom font files (Aeonik Pro, DotMatrixTwo)
├── package.json
├── next.config.ts
├── drizzle.config.ts
├── tsconfig.json
├── vercel.json                       # Empty (cron removed)
└── CLAUDE.md                         # Project operating rules
```

---

## 4. Domain Model — What Arcium Is

Arcium is a **decentralized Multi-Party Computation (MPC) network** built on Solana. The explorer tracks these on-chain entities:

### Entity Hierarchy

```
Program (Solana program using Arcium)
  └── MXE Account (Multi-party eXecution Environment — one per program)
       ├── Computation Definitions (templates: circuit, parameters, outputs)
       │    └── Computations (instances of definitions, executed by clusters)
       └── Cluster Assignment (which cluster runs this MXE's computations)

Cluster (group of nodes that execute computations together)
  └── ARX Nodes (individual validator/compute nodes)
```

### Entity Descriptions

| Entity | On-Chain Account | Key Fields | Explorer Route |
|--------|-----------------|------------|----------------|
| **Cluster** | `Cluster` | offset, size, cuPrice, nodeOffsets, blsKey, isActive | `/clusters`, `/clusters/:offset` |
| **ARX Node** | `ArxNode` | offset, authority, IP, clusterOffset, cuCapacity, isActive | `/nodes`, `/nodes/:offset` |
| **MXE Account** | `MXEAccount` | programId, clusterOffset, authority, x25519Key, compDefOffsets | `/mxes`, `/mxes/:address` |
| **Computation Definition** | `ComputationDefinitionAccount` | programId, defOffset, cuAmount, circuitLen, sourceType | `/definitions`, `/definitions/:address` |
| **Computation** | `ComputationAccount` | offset, clusterOffset, payer, status, timestamps, txSigs | `/computations`, `/computations/:id` |
| **Program** | _(derived/aggregated)_ | programId, mxeAddress, defCount, computationCount | `/programs`, `/programs/:address` |

### Computation Lifecycle

```
  Queued ──────► Executing ──────► Finalized
    │                                  │
    └─────────► Failed ◄──────────────┘
```

- **On-chain statuses:** Only `Queued(0)` and `Finalized(1)` exist on-chain
- **Derived statuses:** `executing` and `failed` are inferred by the frontend based on timestamps and tx signatures

### Scaffold Computations

Computations where `payer === SystemProgram (11111...1111)` are "scaffolds" — initialization/placeholder computations. They are:
- Excluded from dashboard counts and statistics
- Excluded from the live feed
- Filtered out by default in the computations list
- Visible only on MXE detail pages under "Initialization Accounts"

---

## 5. Database Schema

**Database:** Single PostgreSQL instance. Devnet and mainnet data coexist via a `network` column on every table.

**ORM:** Drizzle ORM with `postgres.js` driver (connection pool: max 10, idle timeout: 20s).

### Enums

```sql
CREATE TYPE network AS ENUM ('devnet', 'mainnet');
CREATE TYPE computation_status AS ENUM ('queued', 'executing', 'finalized', 'failed');
```

### Tables

#### `clusters`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| address | varchar(64) | Solana pubkey |
| offset | bigint | Cluster index |
| clusterSize | integer | u16 on-chain |
| maxCapacity | bigint | u64 |
| cuPrice | bigint | u64, compute unit price |
| nodeOffsets | jsonb | Array of u32 node offsets |
| blsPublicKey | varchar(256) | BN254G2 key, hex-encoded |
| isActive | boolean | Derived from activation_epoch |
| network | network enum | |
| createdAt, updatedAt | timestamp | |
| **Unique index:** (address, network) | | |

#### `arxNodes`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| address | varchar(64) | |
| offset | bigint | Node index |
| authorityKey | varchar(64) | Owner wallet |
| ip | varchar(64) | IPv4, null if 0.0.0.0 |
| location | varchar(128) | Optional |
| clusterOffset | bigint | FK to cluster (null if inactive) |
| cuCapacityClaim | bigint | u64 |
| isActive | boolean | Derived from ClusterMembership variant |
| blsPublicKey | varchar(256) | BN254G2, 64 bytes hex |
| x25519PublicKey | varchar(128) | 32 bytes hex |
| network | network enum | |
| createdAt, updatedAt | timestamp | |
| **Unique index:** (address, network) | | |

#### `mxeAccounts`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| address | varchar(64) | |
| mxeProgramId | varchar(64) | The Solana program that owns this MXE |
| clusterOffset | bigint | Assigned cluster (nullable) |
| authority | varchar(64) | Optional authority pubkey |
| x25519Pubkey | varchar(128) | From UtilityPubkeys |
| compDefOffsets | jsonb | Array of u32 definition offsets |
| status | varchar(32) | |
| network | network enum | |
| createdAt, updatedAt | timestamp | |
| **Unique index:** (address, network) | | |

#### `computationDefinitions`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| address | varchar(64) | |
| mxeProgramId | varchar(64) | |
| defOffset | bigint | Definition index |
| cuAmount | bigint | Compute units required |
| circuitLen | bigint | Circuit length |
| sourceType | varchar(32) | "local" / "onchain" / "offchain" |
| isCompleted | boolean | |
| parameters | jsonb | Nullable, parsed from signature |
| outputs | jsonb | Nullable, parsed from signature |
| network | network enum | |
| createdAt, updatedAt | timestamp | |
| **Unique index:** (address, network) | | |

#### `computations`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| address | varchar(64) | |
| computationOffset | varchar(32) | Stringified offset |
| clusterOffset | bigint | |
| payer | varchar(64) | Who paid for the computation |
| mxeProgramId | varchar(64) | |
| status | computation_status enum | |
| isScaffold | boolean | payer === system program |
| queuedAt | timestamp | Resolved from on-chain slot |
| executingAt | timestamp | |
| finalizedAt | timestamp | |
| failedAt | timestamp | |
| queueTxSig | varchar(128) | Oldest tx signature |
| finalizeTxSig | varchar(128) | Callback tx signature (first non-6204 sig after queue) |
| callbackErrorCode | integer | Arcium error code from callback tx (0 = OK, null = unchecked, >0 = error) |
| network | network enum | |
| createdAt, updatedAt | timestamp | |
| **Unique index:** (address, network) | | |
| **Other indexes:** status+network, cluster+network, payer+network, program+network, scaffold+network |

#### `programs`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| programId | varchar(64) | The Solana program ID |
| mxeAddress | varchar(64) | Associated MXE account |
| compDefCount | integer | Number of computation definitions |
| computationCount | integer | Number of computations |
| network | network enum | |
| createdAt, updatedAt | timestamp | |
| **Unique index:** (programId, network) | | |

#### `networkSnapshots`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| timestamp | timestamp | Snapshot time |
| totalClusters | integer | |
| activeNodes | integer | |
| totalComputations | integer | Excludes scaffolds |
| computationsPerMin | real | Derived from last 5 min |
| network | network enum | |
| **Index:** (timestamp, network) | | |

#### `indexerState`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| entityType | varchar(32) | "Cluster", "ArxNode", etc. |
| lastProcessedSlot | bigint | |
| status | varchar(32) | |
| lastRunAt | timestamp | Nullable |
| errorMessage | text | Nullable |
| network | network enum | |
| **Unique index:** (entityType, network) | | |

---

## 6. Worker / Indexer System

The worker is a **standalone Node.js process** (`worker/main.ts`) that runs independently of Next.js. It orchestrates several services in parallel:

### Services

| Service | File | Network | Mechanism | Interval |
|---------|------|---------|-----------|----------|
| GrpcSubscriber | `worker/grpc-subscriber.ts` | Mainnet | Yellowstone gRPC stream | Real-time |
| WsSubscriber | `worker/ws-subscriber.ts` | Devnet | `onProgramAccountChange()` WebSocket | Real-time |
| PollingIndexer | `worker/polling-indexer.ts` | Both | `getProgramAccounts()` per type | 5min (both networks, streaming is primary) |
| TxEnricher | `worker/tx-enricher.ts` | Both | `getSignaturesForAddress()` — identifies queue/callback sigs, extracts callback error codes, skips 6204 retries, fixes stale queued→finalized | 60s, batch of 10 |
| SnapshotWriter | `worker/snapshot-writer.ts` | Both | DB aggregation queries + 30-day retention cleanup | 5min |
| Heartbeat | `worker/main.ts` (inline) | — | Memory + uptime logging | 5min |

### Data Flow

```
On-chain account update
  → GrpcSubscriber (mainnet) or WsSubscriber (devnet)
  → AccountProcessor.processAccountUpdate()
      1. identifyAccountType(buffer)  — match first 8 bytes against known discriminators
      2. parse[Type]Account(buffer)   — Borsh deserialization
      3. upsert[Type](address, parsed, network)  — insert or update DB row
```

### GrpcSubscriber (Mainnet)
- Connects to Yellowstone gRPC at `MAINNET_GRPC_ENDPOINT`
- Subscribes to all accounts owned by `ARCIUM_PROGRAM_ID`
- Keep-alive: 120s interval, 10s timeout
- Auto-reconnect with exponential backoff (1s → 60s max)
- Handles NAPI "channel closed" errors (expected on GC)

### WsSubscriber (Devnet)
- Uses `@solana/web3.js` `onProgramAccountChange()`
- Watchdog timer: if no update for 120s, forces reconnect
- Auto-reconnect with exponential backoff

### PollingIndexer (Fallback)
- Fetches all accounts by discriminator type via `getProgramAccounts()`
- Acts as consistency check — catches anything missed by streams
- Runs sequentially through all 5 account types

### TxEnricher
- Finds computations needing enrichment (4 conditions: missing queueTxSig, finalized missing finalizeTxSig, finalizeTxSig set but callbackErrorCode unchecked, stale queued rows)
- Calls `getSignaturesForAddress(computationPubkey, { limit: 20 })`
- Oldest signature → `queueTxSig`; walks from second-oldest forward, skips error 6204 (AlreadyCallbackedComputation), first non-6204 → `finalizeTxSig`
- Extracts callback error codes: 0 = OK, >0 = Arcium error, null = unchecked
- Fixes stale "queued" rows: if callback sig found for a queued computation, updates status → finalized
- Rate-limited: 200ms between calls (mainnet), 100ms (devnet)
- Skips scaffold computations

### SnapshotWriter
Writes every 5 minutes:
1. **Network snapshots** — totalClusters, activeNodes, totalComputations, computationsPerMin
2. **Program aggregations** — for each MXE, count definitions + non-scaffold computations, upsert into `programs` table
3. **Retention cleanup** — deletes snapshots older than 30 days to prevent unbounded DB growth

### Environment Variables (Worker)

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENABLE_MAINNET` | `true` | Enable mainnet indexing |
| `ENABLE_DEVNET` | `true` | Enable devnet indexing |
| `MAINNET_RPC_URL` | Layer33 POC endpoint | REST RPC |
| `DEVNET_RPC_URL` | Solana public devnet | REST RPC |
| `MAINNET_GRPC_ENDPOINT` | Layer33 POC gRPC | gRPC stream |
| `MAINNET_GRPC_TOKEN` | _(none)_ | gRPC auth |
| `DEVNET_WS_URL` | _(derived from RPC)_ | WebSocket |
| `MAINNET_ENRICHER_RPC_URL` | _(none)_ | Separate RPC for tx enrichment |
| `DATABASE_URL` | **required** | PostgreSQL connection |

---

## 7. On-Chain Account Parsing

### Discriminator System

Account type identification uses the Anchor convention:
```
discriminator = sha256("account:<AccountName>")[0..8]
```

Five account types are recognized:
- `Cluster`
- `ArxNode`
- `MXEAccount`
- `ComputationDefinitionAccount`
- `ComputationAccount`

File: `src/lib/indexer/discriminators.ts`

### Borsh Deserialization

All parsing is **custom** (no external Borsh library). Each parser reads raw bytes at known offsets.

File: `src/lib/indexer/parsers.ts`

#### ArxNode Layout
```
Offset  Field                    Type         DB Field
0       [discriminator]          [u8;8]       (skipped)
8       x25519_pubkey            [u8;32]      x25519PublicKey (hex)
40      primary_staking_account  pubkey       (skipped)
72      metadata.ip              [u8;4]       ip (dotted decimal, null if 0.0.0.0)
76      metadata.peer_id         [u8;32]      (skipped)
108     metadata.location        u8           (skipped)
109     config.authority         pubkey       authorityKey
141     config.callback_auth     pubkey       (skipped)
173     cluster_membership       enum(u8)     → variant 0=Inactive, 1=Active(u32), 2=Proposed(u32)
174+    [if Active/Proposed]     u32          clusterOffset
178+    cu_capacity_claim        u64          cuCapacityClaim
186+    is_active (on-chain)     bool         (UNRELIABLE — ignored)
187+    bls_pubkey               [u8;64]      blsPublicKey (BN254G2, hex)
251+    bump                     u8           (skipped)
```

**Key:** `isActive` is derived from `cluster_membership variant === 1`, NOT from the on-chain `is_active` field (which is unreliable on devnet).

#### Cluster Layout
```
Skip 8 bytes (discriminator)
Option<NodeMetadata>         (1 + optional 37 bytes)
Option<pubkey>               (1 or 33 bytes)
cluster_size                 u16
activation_epoch             u64          → isActive = (value !== U64_MAX)
deactivation_epoch           u64          (skipped)
max_capacity                 u64
cu_price                     u64
cu_price_proposals           [u64;32]     (256 bytes, skipped)
last_updated_epoch           u64          (skipped)
nodes                        Vec<NodeRef> → nodeOffsets (each: offset u32 + rewards u64 + vote u8)
pending_nodes                Vec<u32>     (skipped)
bls_public_key               SetUnset<[u8;64]>  → blsPublicKey (variant 0 = Set)
```

**SetUnset enum:** variant 0 = Set(T), variant 1 = Unset(T, Vec<bool>)

#### MXEAccount Layout
```
Skip 8 bytes
cluster                      Option<u32>
keygen_offset                u64          (skipped)
key_recovery_init_offset     u64          (skipped)
mxe_program_id               pubkey
authority                    Option<pubkey>
utility_pubkeys              SetUnset<UtilityPubkeys>
  → variant 0: x25519[32] + ed25519[32] + elgamal[32] + proof[64] = 160 bytes
  → variant 1: same + Vec<bool>
lut_offset_slot              u64          (skipped)
computation_definitions      Vec<u32>     → compDefOffsets
status                       enum(u8)
bump                         u8           (skipped)
```

#### ComputationDefinitionAccount Layout
```
Skip 8 bytes
finalization_authority       Option<pubkey>
cu_amount                    u64
definition.circuit_len       u32
definition.signature.params  Vec<Parameter>  (1 byte each — enum, NOT struct)
definition.signature.outputs Vec<Output>     (1 byte each — enum, NOT struct)
circuit_source               enum(u8): 0=local, 1=onchain, 2=offchain
  → local:   + 1 byte (enum)
  → onchain: + 1 byte (bool) + 32 bytes (pubkey)
  → offchain: (source string + hash, not fully parsed)
```

#### ComputationAccount Layout
```
Skip 8 bytes
payer                        pubkey
mxe_program_id               pubkey
computation_definition_offset u32         → computationOffset
execution_fee                {base u64, priority u64, delivery u64} (skipped)
slot                         u64          → resolved to queuedAt via getBlockTime()
slot_counter                 u16          (skipped)
status                       enum(u8): 0=Queued, 1=Finalized
```

**Scaffold detection:** `payer === "11111111111111111111111111111111"` (system program)

### PDA Derivation

File: `src/lib/solana/pda.ts`

| Function | Seeds | Returns |
|----------|-------|---------|
| `getClusterAddress(offset)` | `["Cluster", u32(offset)]` | Cluster PDA |
| `getMempoolAddress(clusterOffset)` | `["Mempool", u32(offset)]` | Mempool PDA |
| `getExecutingPoolAddress(clusterOffset)` | `["ExecutingPool", u32(offset)]` | ExecutingPool PDA |
| `getMXEAddress(programId)` | `["MXEAccount", programId]` | MXE PDA |
| `getCompDefAddress(programId, defOffset)` | `["ComputationDefinitionAccount", programId, u32(offset)]` | CompDef PDA |
| `getComputationAddress(clusterOffset, compOffset)` | `["ComputationAccount", u32(cluster), u64(comp)]` | Computation PDA |

All use `ARCIUM_PROGRAM_ID = Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ`

---

## 8. API Layer

All API routes are under `src/app/api/v1/`. Every route uses `export const dynamic = "force-dynamic"` (no static caching).

### Common Patterns

- **Network:** All routes read `?network=devnet|mainnet` via `getNetwork(req)`
- **Pagination:** List routes support `?page=&limit=` via `getPagination(req)` (limit capped at 100)
- **Response format:** `{ data: T, meta: { network, page?, limit?, total? } }`
- **DB import:** All routes use `const { db } = await import("@/lib/db")` (lazy, avoids build errors)

### Endpoints

#### Statistics
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/stats` | GET | Network-wide counts (clusters, nodes, computations by status, programs, MXEs). Uses 2 consolidated SQL queries (FILTER + subselects). `Cache-Control: s-maxage=30, stale-while-revalidate=60`. |
| `/api/v1/stats/history?limit=N` | GET | Array of `networkSnapshots` (max 100, default 50). `Cache-Control: s-maxage=60, stale-while-revalidate=120`. |

#### Computations
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/computations` | GET | Paginated list. Filters: `?status=`, `?cluster=`, `?program=`, `?scaffold=true\|false\|all`. Default excludes scaffolds. |
| `/api/v1/computations/:id` | GET | Single computation by address OR offset. |

#### Clusters
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/clusters` | GET | Paginated, sorted by offset descending. |
| `/api/v1/clusters/:offset` | GET | Single cluster + nested `nodes` array (joined from arxNodes by clusterOffset). |

#### Nodes
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/nodes` | GET | Paginated. Filters: `?cluster=`, `?active=true`. |
| `/api/v1/nodes/:offset` | GET | Single node. |

#### Programs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/programs` | GET | Paginated, sorted by computationCount descending. |
| `/api/v1/programs/:address` | GET | Single program + nested `computationDefinitions` + nested `mxe` (or null). |

#### Definitions
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/definitions` | GET | Paginated, newest first. |
| `/api/v1/definitions/:address` | GET | Single definition. |

#### MXEs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/mxes` | GET | Paginated, newest first. |
| `/api/v1/mxes/:address` | GET | Single MXE + nested `computationDefinitions` + nested `scaffoldComputations`. |

#### Search
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/search?q=` | GET | Multi-entity search. Numeric queries search by offset. Base58 pubkey queries search across all entity types by address/authority/payer/txSig. Returns up to 5 of each type. |

---

## 9. Frontend Pages

All pages are **client components** (`"use client"`) that fetch data via TanStack Query hooks. Navigation uses Next.js `useRouter()` and `useSearchParams()`.

### Root Layout (`src/app/layout.tsx`)
- Wraps everything in `<Providers>` (TanStack QueryClient: staleTime 30s, refetchInterval 30s, retry 2)
- Renders `<Header>` (Suspense-wrapped) + `<main>` + `<Footer>`
- Loads custom fonts: Aeonik Pro (4 weights) + DotMatrixTwo
- Dark theme (`dark` class on `<html>`)

### Dashboard (`/`)
**File:** `src/app/page.tsx`
**Data:** `useStats()`, `useStatsHistory(50)`, `useComputations(page, 20)`

Single data source: fetches one page of computations and passes to both grid and feed. Shared `highlightedAddress` state enables cross-component hover highlighting.

Renders:
1. **6 MetricCards** (2-3 columns responsive): Clusters, Active Nodes, Computations, Queued, Programs, MXEs
2. **Pagination controls** — shared prev/next between grid and live feed (page size 20)
3. **ComputationGrid** — DOM grid (max 5 columns) with info card tiles showing address, offset, status, time, Q/C phase arrows
4. **LiveFeed** — table-style feed from shared computation data (no SSE)
5. **ThroughputChart** — area chart of computations/min over time

### List Pages (6 total)
All follow the same pattern:
1. Header with title + description
2. Optional filters (computations page has status filter buttons)
3. `<DataTable>` with sortable columns and row click → detail page

| Page | Route | Hook | Sort | Key Columns |
|------|-------|------|------|-------------|
| Computations | `/computations` | `useComputations(page, 50, filters)` | Newest first | Offset, Status, Cluster, Payer, Program, Time |
| Clusters | `/clusters` | `useClusters()` | Offset desc | Offset, Address, Size, Nodes, CU Price, Status |
| Nodes | `/nodes` | `useNodes()` | Offset desc | Offset, Address, IP, Cluster, CU Capacity, Status |
| Programs | `/programs` | `usePrograms()` | Computation count desc | Program ID, MXE, Definitions, Computations |
| Definitions | `/definitions` | `useDefinitions()` | Newest first | Address, Program, Offset, CU Amount, Source Type, Status |
| MXEs | `/mxes` | `useMxes()` | Newest first | Address, Program ID, Cluster, Authority, Status |

### Detail Pages (6 total)
Each shows breadcrumb navigation, MetricCards for key stats, and a details section with links.

| Page | Route Param | Hook | Special Features |
|------|------------|------|------------------|
| Computation | `:id` (address or offset) | `useComputation(id)` | Lifecycle timeline (Queued → Executing → Finalized), tx links |
| Cluster | `:offset` (number) | `useCluster(offset)` | Nested node list with click-through |
| Node | `:offset` (number) | `useNode(offset)` | Crypto key display (x25519, BLS) |
| Program | `:address` (program ID) | `useProgram(address)` | Nested computation definitions list |
| Definition | `:address` | `useDefinition(address)` | Parameters/outputs JSON display |
| MXE | `:address` | `useMxe(address)` | Nested definitions + scaffold computations |

### Search Page (`/search?q=`)
**File:** `src/app/search/page.tsx`
**Data:** `useSearch(query)`

Displays mixed results (clusters, nodes, computations, programs, MXEs) with type badges and click-through to detail pages.

---

## 10. Shared Components

### StatusBadge (`src/components/shared/status-badge.tsx`)
Colored pill badge for computation status or node activity status.
- **Statuses:** queued (purple), executing (amber), finalized (green), failed (red), active (green), inactive (gray)
- Renders colored dot + capitalized label

### AddressDisplay (`src/components/shared/address-display.tsx`)
Truncated Solana address with copy-to-clipboard and optional Solscan external link.
- **Props:** `address`, `truncate` (default true), `chars` (default 4), `showCopy`, `showExternalLink`, `href` (internal link), `linkType` ("account" | "tx")

### MetricCard (`src/components/shared/metric-card.tsx`)
KPI card with label, large value, optional icon, optional trend indicator.
- **Props:** `label`, `value`, `icon?` (LucideIcon), `trend?` ({ value, label })

### DataTable (`src/components/shared/data-table.tsx`)
Generic TanStack Table wrapper with client-side sorting, pagination, and row click.
- **Props:** `data`, `columns` (ColumnDef[]), `pageSize` (default 20), `onRowClick?`
- Sortable headers with chevron icons
- Pagination controls (hidden if single page)

### ComputationGrid (`src/components/shared/computation-grid.tsx`)
DOM-based CSS grid with info card tiles showing Q/C phase status per computation.
- Max 5 columns, `1fr` sizing, 6px gap, responsive via ResizeObserver
- Each tile shows: truncated address, time ago, computation offset, status text
- **Q/C phase arrows** (text-3xl font-black): purple ↑ (queued), green ↓ (callback OK), red ! (callback error), gray ↓ (pending)
- Hover tooltip shows address, queue timestamp, callback result with Arcium error details
- Cross-highlight: `highlightedAddress` prop highlights matching tile (ring + scale)
- Click navigates to computation detail
- `PHASE_COLORS`: queued=`#6D45FF`, callbackOk=`#4ade80`, callbackError=`#f87171`, pending=`#6b7280`
- Error details from `src/lib/arcium-errors.ts` (all 67 Arcium error codes 6000–6716)
- Shared type: `SharedComputation` from `src/components/shared/computation-types.ts`

### ThroughputChart (`src/components/shared/throughput-chart.tsx`)
Recharts AreaChart showing computations per minute over time.
- Purple gradient fill (#6D45FF)
- X-axis: HH:MM, Y-axis: count
- Responsive (100% width, 200px height)

### LiveFeed (`src/components/shared/live-feed.tsx`)
Table-style computation feed receiving shared data as props (no SSE, no independent fetching).
- Grid layout with columns: status dot, address, offset, payer, program, time
- Cross-highlight: receives `highlightedAddress` and `onHover` props, auto-scrolls to highlighted item
- Uses same `SharedComputation` type as ComputationGrid

### Header (`src/components/layout/header.tsx`)
Navigation bar with search (Cmd+K) and network toggle (devnet/mainnet).
- Nav items: Dashboard, Clusters, Nodes, Computations, Programs, MXEs
- Mobile: collapsible hamburger menu
- Network toggle updates URL params and refreshes

### Footer (`src/components/layout/footer.tsx`)
Static footer with links to API, docs, and arcium.com.

### Providers (`src/components/providers.tsx`)
TanStack QueryClientProvider wrapper with defaults:
- `staleTime: 30_000`
- `refetchInterval: 30_000`
- `retry: 2`

---

## 11. Hooks & Client Data Fetching

### `useNetwork()` (`src/lib/hooks/use-network.ts`)
Reads `?network=` from URL search params. Returns `"devnet"` or `"mainnet"` (default: devnet).

### `useApi` hooks (`src/lib/hooks/use-api.ts`)
All hooks use TanStack Query's `useQuery()` with network-aware query keys.

**Helper:** `fetchApi<T>(path, network)` — appends `?network=` and throws on non-200.

| Hook | Endpoint | Query Key |
|------|----------|-----------|
| `useStats()` | `/api/v1/stats` | `["stats", network]` |
| `useStatsHistory(limit)` | `/api/v1/stats/history` | `["stats-history", network, limit]` |
| `useClusters(page, limit)` | `/api/v1/clusters` | `["clusters", network, page, limit]` |
| `useCluster(offset)` | `/api/v1/clusters/:offset` | `["cluster", network, offset]` |
| `useNodes(page, limit, filters?)` | `/api/v1/nodes` | `["nodes", network, page, limit, filters]` |
| `useNode(offset)` | `/api/v1/nodes/:offset` | `["node", network, offset]` |
| `useComputations(page, limit, filters?)` | `/api/v1/computations` | `["computations", network, page, limit, filters]` |
| `useComputation(id)` | `/api/v1/computations/:id` | `["computation", network, id]` |
| `usePrograms(page, limit)` | `/api/v1/programs` | `["programs", network, page, limit]` |
| `useProgram(address)` | `/api/v1/programs/:address` | `["program", network, address]` |
| `useDefinitions(page, limit)` | `/api/v1/definitions` | `["definitions", network, page, limit]` |
| `useDefinition(address)` | `/api/v1/definitions/:address` | `["definition", network, address]` |
| `useMxes(page, limit)` | `/api/v1/mxes` | `["mxes", network, page, limit]` |
| `useMxe(address)` | `/api/v1/mxes/:address` | `["mxe", network, address]` |
| `useSearch(query)` | `/api/v1/search` | `["search", network, query]` |

---

## 12. Styling & Theme

### CSS Variables (`src/app/globals.css`)

The app uses a custom dark theme inspired by mempool.space:

```css
/* Backgrounds */
--bg-primary:    #1d1f31    /* Main background */
--bg-surface:    #24273a    /* Cards, panels */
--bg-elevated:   #2a2d42    /* Hover states, modals */

/* Borders */
--border-primary: #363a54
--border-muted:   #2e3148

/* Text */
--text-primary:   #e8e8f0   /* Main text */
--text-secondary: #8b8fa3   /* Secondary text */
--text-muted:     #6b6f85   /* Disabled/muted */

/* Status Colors */
--status-queued:    #6D45FF  /* Arcium purple */
--status-executing: #fbbf24  /* Amber */
--status-finalized: #4ade80  /* Green */
--status-failed:    #f87171  /* Red */

/* Accents */
--accent-link:    #60a5fa    /* Blue links */
--accent-arcium:  #6D45FF    /* Brand purple */
--accent-pink:    #F1A1FF    /* Pink highlight */
```

These are registered as Tailwind v4 theme tokens via `@theme inline`, enabling utilities like `bg-bg-primary`, `text-status-queued`, etc.

### Fonts
- **Inter** (Google Fonts, 5 weights: 300–700) — primary sans-serif
- CSS variable: `--font-inter`

### Utility
- `cn()` from `src/lib/utils.ts` — combines `clsx` + `tailwind-merge` for conditional class composition

---

## 13. Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts (`dev`, `build`, `worker`, `worker:dev`, `db:generate`, `db:migrate`, `db:studio`) |
| `next.config.ts` | Minimal/empty (standard Next.js 16 defaults) |
| `tsconfig.json` | Strict mode, ES2017 target, `@/*` path alias |
| `drizzle.config.ts` | Schema at `./src/lib/db/schema.ts`, PostgreSQL, output `./drizzle/` |
| `postcss.config.mjs` | `@tailwindcss/postcss` (Tailwind v4) |
| `eslint.config.mjs` | Next.js core-web-vitals + TypeScript rules |
| `vercel.json` | Empty (cron removed — worker handles all indexing) |
| `worker/tsconfig.json` | Worker-specific TS config |

### npm Scripts

```bash
npm run dev          # Next.js dev server
npm run build        # Production build
npm run start        # Production server
npm run worker       # Run indexer worker (tsx worker/main.ts)
npm run worker:dev   # Watch mode for worker
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Apply migrations
npm run db:studio    # Drizzle Studio (DB GUI)
```

---

## 14. Deployment & Infrastructure

- **Hosting:** Vercel (Next.js app) + Railway (PostgreSQL + Worker)
- **Worker:** Runs as persistent Railway service (all indexing: gRPC + WS + polling + tx enricher + snapshots)
- **Database:** Single PostgreSQL instance on Railway
- **RPC:** Layer33 POC endpoints for mainnet (REST + gRPC), Solana public for devnet

### Environment Variables (Next.js)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXT_PUBLIC_DEVNET_RPC_URL` | No | Client-side devnet RPC |
| `NEXT_PUBLIC_MAINNET_RPC_URL` | No | Client-side mainnet RPC |
| `DEVNET_RPC_URL` | No | Server-side devnet RPC |
| `MAINNET_RPC_URL` | No | Server-side mainnet RPC |

---

## 15. Known Gotchas

### On-Chain Parsing
1. **ArxNode `isActive`** — The on-chain boolean field is unreliable (always 0 on devnet). Must derive from `ClusterMembership` variant: variant 1 = Active.
2. **BLS keys** — Are **BN254G2** (64 bytes), NOT BLS12-381 (48 bytes).
3. **ComputationStatus** — Only `Queued(0)` and `Finalized(1)` exist on-chain. `executing` and `failed` are derived states.
4. **Parameter/Output enums** — In `ComputationSignature`, these are 1-byte enums, NOT structs.
5. **SetUnset<T>** — variant 0 = Set(T), variant 1 = Unset(T, Vec<bool>). Must handle both variants.
6. **cluster_size** — Is `u16`, NOT `u32`.
7. **u32/u64 fields** — Must use bigint in PostgreSQL (u32 max 4,294,967,295 > signed int32 max 2,147,483,647).
8. **Slot overflow** — gRPC client v5 deserializes slot as i32 but mainnet slots exceed i32. Handled via pattern detection + fast reconnect.

### Build & Dev
9. **Lazy DB import** — All API routes and indexer files use `await import("@/lib/db")` to avoid `DATABASE_URL` errors at Next.js build time.
10. **npm on this machine** — Very slow (13+ min clean install). Must use `--legacy-peer-deps`. Must fully `rm -rf node_modules` before reinstall.
11. **Node.js version** — Must use v20 via nvm (`.nvmrc` in repo root).

### TypeScript
12. **`Record<string, unknown>` in JSX** — Use `!!value && (<JSX/>)` instead of `value && (<JSX/>)` because `unknown` isn't assignable to ReactNode.

### Infrastructure
13. **gRPC keep-alive** — Critical for Layer33 endpoint. 120s interval, 10s timeout.
14. **"channel closed" error** — Expected from gRPC NAPI binding on client GC. Handled via unhandledRejection handler.
15. **No SSE/WebSocket** — Dashboard uses shared TanStack Query data with 30s refetch interval instead of real-time streaming.

---

## Appendix: TypeScript Interfaces

File: `src/types/index.ts`

```typescript
type Network = "devnet" | "mainnet"
type ComputationStatus = "queued" | "executing" | "finalized" | "failed"

interface Cluster {
  address, offset, clusterSize, maxCapacity, cuPrice,
  nodeOffsets: number[], blsPublicKey, isActive, network,
  createdAt, updatedAt
}

interface ArxNode {
  address, offset, authorityKey, ip, location,
  clusterOffset, cuCapacityClaim, isActive,
  blsPublicKey, x25519PublicKey, network,
  createdAt, updatedAt
}

interface MxeAccount {
  address, mxeProgramId, clusterOffset, authority,
  x25519Pubkey, compDefOffsets: number[], status, network,
  createdAt, updatedAt
}

interface ComputationDefinition {
  address, mxeProgramId, defOffset, cuAmount, circuitLen,
  sourceType, isCompleted,
  parameters: Record<string, unknown> | null,
  outputs: Record<string, unknown> | null,
  network, createdAt, updatedAt
}

interface Computation {
  address, computationOffset, clusterOffset, payer, mxeProgramId,
  status: ComputationStatus, isScaffold,
  queuedAt, executingAt, finalizedAt, failedAt,
  queueTxSig, finalizeTxSig,
  callbackErrorCode: number | null,  // 0=OK, >0=Arcium error, null=unchecked
  network, createdAt, updatedAt
}

interface Program {
  programId, mxeAddress, compDefCount, computationCount,
  network, createdAt, updatedAt
}

interface NetworkSnapshot {
  timestamp, totalClusters, activeNodes, totalComputations,
  computationsPerMin, network
}

interface NetworkStats {
  totalClusters, activeNodes, totalComputations,
  queuedComputations, executingComputations, finalizedComputations,
  totalPrograms, totalMxes, network
}

interface ApiResponse<T> {
  data: T,
  meta: { network, page?, limit?, total? }
}
```
