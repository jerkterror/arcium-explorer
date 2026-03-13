"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useNetwork } from "@/lib/hooks/use-network";
import { getArciumError } from "@/lib/arcium-errors";
import { truncateAddress, timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { SharedComputation } from "./computation-types";

// Phase colors — purple for queue, green for callback OK
export const PHASE_COLORS = {
  queued: "#6D45FF",
  callbackOk: "#4ade80",
  callbackError: "#f87171",
  pending: "#6b7280",
} as const;

const MAX_COLS = 5;
const GAP = 6;

interface ComputationGridProps {
  computations: SharedComputation[];
  highlightedAddress: string | null;
  onHover: (address: string | null) => void;
  className?: string;
}

export function ComputationGrid({
  computations,
  highlightedAddress,
  onHover,
  className,
}: ComputationGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const network = useNetwork();
  const [containerWidth, setContainerWidth] = useState(0);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    tile: SharedComputation;
  } | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect.width;
      if (width > 0) setContainerWidth(width);
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  // Responsive columns: max 5, min width ~120px per tile
  const cols =
    containerWidth > 0
      ? Math.min(MAX_COLS, Math.max(1, Math.floor((containerWidth + GAP) / (120 + GAP))))
      : 0;

  const handleClick = useCallback(
    (tile: SharedComputation) => {
      router.push(`/computations/${tile.address}?network=${network}`);
    },
    [router, network]
  );

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent, tile: SharedComputation) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        tile,
      });
      onHover(tile.address);
    },
    [onHover]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    onHover(null);
  }, [onHover]);

  if (computations.length === 0) {
    return (
      <div ref={wrapperRef} className={cn("w-full", className)}>
        <div className="flex h-48 items-center justify-center text-sm text-text-muted">
          <div className="text-center">
            <p>No computations indexed yet</p>
            <p className="mt-1 text-xs">
              Computations will appear here as they are discovered
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (cols === 0) {
    return (
      <div ref={wrapperRef} className={cn("w-full", className)}>
        <div className="flex h-48 items-center justify-center text-sm text-text-muted">
          Loading grid...
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: `${GAP}px`,
        }}
      >
        {computations.map((tile) => {
          const isFinalized = tile.status === "finalized";
          const isFailed = tile.status === "failed";
          const hasError =
            tile.callbackErrorCode !== null && tile.callbackErrorCode > 0;
          // Check callbackErrorCode directly too — covers the race window where
          // the enricher set the error code but the indexer overwrote status
          const hasCallback =
            isFinalized || isFailed || tile.callbackErrorCode !== null;
          const isHighlighted = highlightedAddress === tile.address;
          const timestamp = tile.queuedAt || tile.createdAt;

          return (
            <div
              key={tile.address}
              className={cn(
                "flex cursor-pointer flex-col overflow-hidden rounded-md border transition-all",
                isHighlighted
                  ? "border-white/60 ring-1 ring-white/40 scale-[1.03] z-10"
                  : "border-border-primary hover:border-white/30"
              )}
              style={{ backgroundColor: "#1e2035" }}
              onClick={() => handleClick(tile)}
              onMouseEnter={(e) => handleMouseEnter(e, tile)}
              onMouseLeave={handleMouseLeave}
            >
              {/* Info section */}
              <div className="px-2.5 pt-2 pb-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-medium text-text-primary">
                    {truncateAddress(tile.address, 4)}
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {timestamp ? timeAgo(timestamp) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-muted">
                    #{tile.computationOffset}
                  </span>
                  <span className="text-[10px] capitalize text-text-secondary">
                    {tile.status}
                  </span>
                </div>
              </div>
              {/* Q/C phase arrows — link to Solscan tx when sig available */}
              <div className="flex items-center justify-center gap-5 pb-3 pt-1">
                {(() => {
                  const queueUrl = tile.queueTxSig
                    ? `https://solscan.io/tx/${tile.queueTxSig}${network === "devnet" ? "?cluster=devnet" : ""}`
                    : null;
                  const Tag = queueUrl ? "a" : "span";
                  const linkProps = queueUrl
                    ? { href: queueUrl, target: "_blank", rel: "noopener noreferrer", title: "View queue TX on Solscan", onClick: (e: React.MouseEvent) => e.stopPropagation() }
                    : {};
                  return (
                    <Tag
                      {...linkProps}
                      className={cn("text-3xl font-black leading-none", queueUrl && "hover:brightness-125 transition-all")}
                      style={{ color: PHASE_COLORS.queued }}
                    >
                      ↑
                    </Tag>
                  );
                })()}
                {(() => {
                  const callbackColor = hasCallback
                    ? hasError ? PHASE_COLORS.callbackError : PHASE_COLORS.callbackOk
                    : PHASE_COLORS.pending;
                  const callbackUrl = tile.finalizeTxSig
                    ? `https://solscan.io/tx/${tile.finalizeTxSig}${network === "devnet" ? "?cluster=devnet" : ""}`
                    : null;
                  const Tag = callbackUrl ? "a" : "span";
                  const linkProps = callbackUrl
                    ? { href: callbackUrl, target: "_blank", rel: "noopener noreferrer", title: "View callback TX on Solscan", onClick: (e: React.MouseEvent) => e.stopPropagation() }
                    : {};
                  return (
                    <Tag
                      {...linkProps}
                      className={cn("text-3xl font-black leading-none", callbackUrl && "hover:brightness-125 transition-all")}
                      style={{
                        color: callbackColor,
                        opacity: hasCallback ? 1 : 0.4,
                      }}
                    >
                      {hasError ? "!" : "↓"}
                    </Tag>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {tooltip && <GridTooltip data={tooltip} />}
    </div>
  );
}

function GridTooltip({
  data,
}: {
  data: { x: number; y: number; tile: SharedComputation };
}) {
  const { tile, x, y } = data;
  const hasCallback =
    tile.status === "finalized" || tile.status === "failed";
  const hasError =
    tile.callbackErrorCode !== null && tile.callbackErrorCode > 0;
  const error = hasError ? getArciumError(tile.callbackErrorCode!) : null;

  return (
    <div
      className="pointer-events-none absolute z-50 max-w-xs rounded-md border border-border-primary bg-bg-elevated px-3 py-2 text-xs shadow-lg"
      style={{
        left: x,
        top: y - 8,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="font-mono text-text-primary">
        {tile.address.slice(0, 8)}...{tile.address.slice(-4)}
      </div>
      <div className="mt-1 space-y-0.5 text-text-secondary">
        <div className="flex items-center gap-1.5">
          <span style={{ color: PHASE_COLORS.queued }}>↑ Q:</span>
          <span>
            Queued
            {tile.queuedAt
              ? ` · ${new Date(tile.queuedAt).toLocaleString()}`
              : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            style={{
              color: hasCallback
                ? hasError
                  ? PHASE_COLORS.callbackError
                  : PHASE_COLORS.callbackOk
                : PHASE_COLORS.pending,
            }}
          >
            {hasCallback ? (hasError ? "! C:" : "↓ C:") : "↓ C:"}
          </span>
          <span>
            {!hasCallback
              ? "Pending"
              : hasError && error
              ? `Error: ${error.name} (${tile.callbackErrorCode}) — ${error.msg}`
              : hasError
              ? `Error code ${tile.callbackErrorCode}`
              : `OK${tile.finalizedAt ? ` · ${new Date(tile.finalizedAt).toLocaleString()}` : ""}`}
          </span>
        </div>
      </div>
    </div>
  );
}
