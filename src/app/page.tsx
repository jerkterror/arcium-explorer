"use client";

import { Suspense, useState, useCallback } from "react";
import { useStats, useStatsHistory, useComputations } from "@/lib/hooks/use-api";
import { useNetwork } from "@/lib/hooks/use-network";
import { MetricCard } from "@/components/shared/metric-card";
import { formatNumber } from "@/lib/utils";
import {
  Server,
  Cpu,
  Activity,
  Layers,
  Code,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ComputationGrid, PHASE_COLORS } from "@/components/shared/computation-grid";
import { ThroughputChart } from "@/components/shared/throughput-chart";
import { LiveFeed } from "@/components/shared/live-feed";
import type { SharedComputation } from "@/components/shared/computation-types";

const PAGE_SIZE = 20;

function DashboardContent() {
  const network = useNetwork();
  const { data: statsResponse, isLoading } = useStats();
  const { data: historyResponse } = useStatsHistory(50);
  const stats = statsResponse?.data as Record<string, number> | undefined;
  const history = (historyResponse?.data || []) as Array<{
    timestamp: string;
    totalComputations: number;
    computationsPerMin: number;
    activeNodes: number;
  }>;

  // Shared state: pagination + hover
  const [page, setPage] = useState(1);
  const [highlightedAddress, setHighlightedAddress] = useState<string | null>(null);

  const { data: compResponse } = useComputations(page, PAGE_SIZE);
  const computations = (compResponse?.data || []) as SharedComputation[];
  const total = (compResponse?.meta?.total as number) || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleHover = useCallback((address: string | null) => {
    setHighlightedAddress(address);
  }, []);

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          Arcium Network Explorer
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Real-time visibility into confidential computations on the Arcium MPC
          network
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Clusters"
          value={isLoading ? "..." : formatNumber(stats?.totalClusters || 0)}
          icon={Layers}
          href={`/clusters?network=${network}`}
        />
        <MetricCard
          label="Active Nodes"
          value={isLoading ? "..." : formatNumber(stats?.activeNodes || 0)}
          icon={Server}
          href={`/nodes?network=${network}&active=true`}
        />
        <MetricCard
          label="Computations"
          value={isLoading ? "..." : formatNumber(stats?.totalComputations || 0)}
          icon={Cpu}
          href={`/computations?network=${network}`}
        />
        <MetricCard
          label="Queued"
          value={isLoading ? "..." : formatNumber(stats?.queuedComputations || 0)}
          icon={Activity}
          href={`/computations?network=${network}&status=queued`}
        />
        <MetricCard
          label="Programs"
          value={isLoading ? "..." : formatNumber(stats?.totalPrograms || 0)}
          icon={Code}
          href={`/programs?network=${network}`}
        />
        <MetricCard
          label="MXEs"
          value={isLoading ? "..." : formatNumber(stats?.totalMxes || 0)}
          icon={Shield}
          href={`/mxes?network=${network}`}
        />
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">
          {total > 0
            ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${formatNumber(total)} computations`
            : "No computations"}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border-primary bg-bg-surface text-text-secondary transition-colors hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-text-secondary tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border-primary bg-bg-surface text-text-secondary transition-colors hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Computation grid + live feed */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-lg border border-border-primary bg-bg-surface p-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-sm font-medium text-text-secondary">
                Computation Grid
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                {([
                  ["queued", "Queued"],
                  ["callbackOk", "CB OK"],
                  ["callbackError", "CB Error"],
                  ["pending", "Pending"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ backgroundColor: PHASE_COLORS[key] }}
                    />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <ComputationGrid
              computations={computations}
              highlightedAddress={highlightedAddress}
              onHover={handleHover}
            />
          </div>
        </div>
        <div>
          <div className="flex h-full flex-col rounded-lg border border-border-primary bg-bg-surface p-4">
            <h2 className="mb-4 text-sm font-medium text-text-secondary">
              Live Feed
            </h2>
            <LiveFeed
              computations={computations}
              highlightedAddress={highlightedAddress}
              onHover={handleHover}
            />
          </div>
        </div>
      </div>

      {/* Throughput chart */}
      <div className="rounded-lg border border-border-primary bg-bg-surface p-4">
        <h2 className="mb-4 text-sm font-medium text-text-secondary">
          Throughput
        </h2>
        <ThroughputChart data={history} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-text-muted">Loading...</div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
