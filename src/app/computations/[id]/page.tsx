"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useComputation } from "@/lib/hooks/use-api";
import { useNetwork } from "@/lib/hooks/use-network";
import { StatusBadge } from "@/components/shared/status-badge";
import { AddressDisplay } from "@/components/shared/address-display";
import { formatTimestamp } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ComputationStatus } from "@/types";

const LIFECYCLE_STEPS: { key: string; label: string; status: ComputationStatus; color: string; bgColor: string; borderColor: string }[] = [
  { key: "queuedAt", label: "Queued", status: "queued", color: "text-status-queued", bgColor: "bg-status-queued/20", borderColor: "border-status-queued" },
  { key: "executingAt", label: "Executing", status: "executing", color: "text-status-executing", bgColor: "bg-status-executing/20", borderColor: "border-status-executing" },
  { key: "finalizedAt", label: "Finalized", status: "finalized", color: "text-status-finalized", bgColor: "bg-status-finalized/20", borderColor: "border-status-finalized" },
];

function ComputationDetailContent() {
  const params = useParams();
  const network = useNetwork();
  const id = params.id as string;
  const { data: response, isLoading } = useComputation(id);
  const comp = response?.data as Record<string, unknown> | undefined;

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-text-muted">
        Loading computation...
      </div>
    );
  }

  if (!comp) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-text-muted">
        Computation not found
      </div>
    );
  }

  const status = comp.status as ComputationStatus;
  const callbackErrorCode = comp.callbackErrorCode as number | null;

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/computations?network=${network}`}
          className="text-sm text-text-muted hover:text-text-secondary"
        >
          Computations
        </Link>
        <span className="text-text-muted">/</span>
        <h1 className="text-xl font-semibold text-text-primary">
          Computation
        </h1>
        <StatusBadge status={status} />
      </div>

      {/* Callback error alert */}
      {callbackErrorCode !== null && callbackErrorCode > 0 && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
          <h3 className="text-sm font-medium text-red-400">Callback Error</h3>
          <p className="mt-1 text-sm text-red-300/80">
            Callback failed with error code {callbackErrorCode}
          </p>
        </div>
      )}

      {/* Lifecycle timeline */}
      <div className="rounded-lg border border-border-primary bg-bg-surface p-4">
        <h2 className="mb-4 text-sm font-medium text-text-secondary">
          Lifecycle
        </h2>
        <div className="flex items-center">
          {LIFECYCLE_STEPS.map((step, i) => {
            const timestamp = comp[step.key] as string | null;
            const isCompleted = !!timestamp;
            const isCurrent = status === step.status;
            const isFailed = status === "failed" && !isCompleted;

            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                      isCompleted
                        ? `${step.borderColor} ${step.bgColor}`
                        : isCurrent
                        ? `${step.borderColor} ${step.bgColor} animate-pulse`
                        : isFailed
                        ? "border-status-failed bg-status-failed/20"
                        : "border-border-primary bg-bg-elevated"
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs font-medium",
                        isCompleted || isCurrent
                          ? step.color
                          : "text-text-muted"
                      )}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <span className="text-xs text-text-secondary">{step.label}</span>
                  {timestamp && (
                    <span className="text-[10px] text-text-muted">
                      {formatTimestamp(timestamp)}
                    </span>
                  )}
                </div>
                {i < LIFECYCLE_STEPS.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 mx-4 self-start mt-5",
                      isCompleted ? step.borderColor.replace("border-", "bg-") : "bg-border-primary"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Details */}
      <div className="rounded-lg border border-border-primary bg-bg-surface p-4 space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">Details</h2>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-text-muted">Address</span>
            <div className="min-w-0">
              <AddressDisplay
                address={String(comp.address)}
                showExternalLink
                solanaExplorerNetwork={network === "mainnet" ? "mainnet-beta" : "devnet"}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-text-muted">Computation Offset</span>
            <span className="font-mono text-xs truncate min-w-0">{String(comp.computationOffset)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-text-muted">Cluster</span>
            <Link
              href={`/clusters/${comp.clusterOffset}?network=${network}`}
              className="font-mono text-accent-link hover:underline"
            >
              {String(comp.clusterOffset)}
            </Link>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-text-muted">Payer</span>
            <div className="min-w-0">
              <AddressDisplay address={String(comp.payer)} showExternalLink solanaExplorerNetwork={network === "mainnet" ? "mainnet-beta" : "devnet"} />
            </div>
          </div>
          {!!comp.mxeProgramId && (
            <div className="flex items-center justify-between gap-4">
              <span className="shrink-0 text-text-muted">Program</span>
              <div className="min-w-0">
                <Link
                  href={`/programs/${comp.mxeProgramId}?network=${network}`}
                  className="text-accent-link hover:underline"
                >
                  <AddressDisplay address={String(comp.mxeProgramId)} showCopy={false} />
                </Link>
              </div>
            </div>
          )}
          {!!comp.queueTxSig && (
            <div className="flex items-center justify-between gap-4">
              <span className="shrink-0 text-text-muted">Queue TX</span>
              <div className="min-w-0">
                <AddressDisplay address={String(comp.queueTxSig)} chars={8} showExternalLink solanaExplorerNetwork={network === "mainnet" ? "mainnet-beta" : "devnet"} linkType="tx" />
              </div>
            </div>
          )}
          {!!comp.finalizeTxSig && (
            <div className="flex items-center justify-between gap-4">
              <span className="shrink-0 text-text-muted">Finalize TX</span>
              <div className="min-w-0">
                <AddressDisplay address={String(comp.finalizeTxSig)} chars={8} showExternalLink solanaExplorerNetwork={network === "mainnet" ? "mainnet-beta" : "devnet"} linkType="tx" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ComputationDetailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center text-text-muted">Loading...</div>}>
      <ComputationDetailContent />
    </Suspense>
  );
}
