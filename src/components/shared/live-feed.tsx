"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useNetwork } from "@/lib/hooks/use-network";
import { useComputations } from "@/lib/hooks/use-api";
import { truncateAddress, timeAgo } from "@/lib/utils";
import type { ComputationStatus } from "@/types";

const STATUS_DOT_COLORS: Record<string, string> = {
  queued: "bg-status-queued",
  executing: "bg-status-executing",
  finalized: "bg-status-finalized",
  failed: "bg-status-failed",
};

interface LiveComputation {
  address: string;
  computationOffset: string;
  status: ComputationStatus;
  payer: string;
  mxeProgramId: string;
  createdAt: string;
}

const MAX_ITEMS = 30;

export function LiveFeed() {
  const network = useNetwork();
  const [items, setItems] = useState<LiveComputation[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // SSE connection
  useEffect(() => {
    const es = new EventSource(
      `/api/v1/computations/live?network=${network}`
    );
    eventSourceRef.current = es;

    es.onopen = () => setSseConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "initial" && Array.isArray(data.computations)) {
          setItems(
            data.computations.slice(0, MAX_ITEMS).map(mapComputation)
          );
        } else if (data.type === "update" && Array.isArray(data.computations)) {
          setItems((prev) => {
            const newItems = data.computations.map(mapComputation);
            const existingAddresses = new Set(prev.map((c) => c.address));
            const unique = newItems.filter(
              (c: LiveComputation) => !existingAddresses.has(c.address)
            );
            return [...unique, ...prev].slice(0, MAX_ITEMS);
          });
        }
      } catch {
        // Ignore malformed events
      }
    };

    es.onerror = () => {
      setSseConnected(false);
      es.close();
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [network]);

  // Fallback polling when SSE is not connected
  const { data: fallbackResponse } = useComputations(1, MAX_ITEMS);
  const fallbackComputations = fallbackResponse?.data as
    | LiveComputation[]
    | undefined;

  // Use fallback data if SSE hasn't provided any
  const displayItems =
    items.length > 0 ? items : (fallbackComputations || []);

  // Tick to refresh "time ago" labels
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  if (displayItems.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        <div className="text-center">
          <p>No recent computations</p>
          <p className="mt-1 text-xs">
            New computations will appear here in real-time
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2 text-xs text-text-muted">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            sseConnected ? "bg-status-queued animate-pulse" : "bg-text-muted"
          }`}
        />
        {sseConnected ? "Live" : "Polling"}
      </div>
      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_auto_1fr_1fr_auto] items-center gap-x-3 border-b border-border-muted px-2 pb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
        <span />
        <span>Address</span>
        <span>Offset</span>
        <span>Payer</span>
        <span>Program</span>
        <span>Time</span>
      </div>
      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {displayItems.map((comp) => (
          <Link
            key={comp.address}
            href={`/computations/${comp.address}?network=${network}`}
            className="grid grid-cols-[auto_1fr_auto_1fr_1fr_auto] items-center gap-x-3 rounded-md px-2 py-1.5 transition-colors hover:bg-bg-elevated"
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                STATUS_DOT_COLORS[comp.status] || "bg-text-muted"
              }`}
            />
            <span className="truncate font-mono text-xs text-text-primary">
              {truncateAddress(comp.address, 4)}
            </span>
            <span className="font-mono text-xs text-text-secondary">
              {comp.computationOffset}
            </span>
            <span className="truncate font-mono text-xs text-text-muted">
              {truncateAddress(comp.payer, 4)}
            </span>
            <span className="truncate font-mono text-xs text-text-muted">
              {comp.mxeProgramId
                ? truncateAddress(comp.mxeProgramId, 4)
                : "—"}
            </span>
            <span className="shrink-0 text-xs text-text-muted">
              {timeAgo(comp.createdAt)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function mapComputation(c: Record<string, unknown>): LiveComputation {
  return {
    address: (c.address as string) || "",
    computationOffset:
      (c.computationOffset as string) ||
      (c.computation_offset as string) ||
      "",
    status: (c.status as ComputationStatus) || "queued",
    payer: (c.payer as string) || "",
    mxeProgramId:
      (c.mxeProgramId as string) ||
      (c.mxe_program_id as string) ||
      "",
    createdAt: (c.createdAt as string) || (c.created_at as string) || "",
  };
}
