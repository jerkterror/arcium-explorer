"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useMxe } from "@/lib/hooks/use-api";
import { useNetwork } from "@/lib/hooks/use-network";
import { StatusBadge } from "@/components/shared/status-badge";
import { AddressDisplay } from "@/components/shared/address-display";
import type { ComputationStatus } from "@/types";
import Link from "next/link";

function MxeDetailContent() {
  const params = useParams();
  const network = useNetwork();
  const address = params.address as string;
  const { data: response, isLoading } = useMxe(address);
  const mxe = response?.data as Record<string, unknown> | undefined;
  const compDefs = (mxe?.computationDefinitions || []) as Array<{
    address: string;
    defOffset: number;
    cuAmount: number;
    isCompleted: boolean;
  }>;
  const scaffoldComputations = (mxe?.scaffoldComputations || []) as Array<{
    address: string;
    computationOffset: string;
    status: string;
  }>;

  if (isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-text-muted">Loading MXE...</div>;
  }

  if (!mxe) {
    return <div className="flex min-h-[50vh] items-center justify-center text-text-muted">MXE not found</div>;
  }

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/mxes?network=${network}`} className="text-sm text-text-muted hover:text-text-secondary">MXEs</Link>
        <span className="text-text-muted">/</span>
        <h1 className="text-xl font-semibold text-text-primary">MXE Account</h1>
        <StatusBadge status={String(mxe.status) === "active" ? "active" : "inactive"} />
      </div>

      <div className="rounded-lg border border-border-primary bg-bg-surface p-4 space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">Details</h2>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Address</span>
            <AddressDisplay address={address} truncate={false} showExternalLink solanaExplorerNetwork={network === "mainnet" ? "mainnet-beta" : "devnet"} />
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Program</span>
            <Link href={`/programs/${mxe.mxeProgramId}?network=${network}`} className="text-accent-link hover:underline">
              <AddressDisplay address={String(mxe.mxeProgramId)} showCopy={false} />
            </Link>
          </div>
          {mxe.clusterOffset !== null && (
            <div className="flex justify-between">
              <span className="text-text-muted">Cluster</span>
              <Link href={`/clusters/${mxe.clusterOffset}?network=${network}`} className="font-mono text-accent-link hover:underline">
                {String(mxe.clusterOffset)}
              </Link>
            </div>
          )}
          {!!mxe.authority && (
            <div className="flex justify-between">
              <span className="text-text-muted">Authority</span>
              <AddressDisplay address={String(mxe.authority)} />
            </div>
          )}
          {!!mxe.x25519Pubkey && (
            <div className="flex justify-between">
              <span className="text-text-muted">x25519 Key</span>
              <AddressDisplay address={String(mxe.x25519Pubkey)} chars={8} />
            </div>
          )}
        </div>
      </div>

      {compDefs.length > 0 && (
        <div className="rounded-lg border border-border-primary bg-bg-surface p-4 space-y-3">
          <h2 className="text-sm font-medium text-text-secondary">Computation Definitions ({compDefs.length})</h2>
          <div className="space-y-2">
            {compDefs.map((def) => (
              <Link
                key={def.address}
                href={`/definitions/${def.address}?network=${network}`}
                className="flex items-center justify-between rounded-md border border-border-muted p-3 hover:bg-bg-elevated/50 transition-colors"
              >
                <AddressDisplay address={def.address} showCopy={false} />
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  <span>Offset: {def.defOffset}</span>
                  <span>CU: {def.cuAmount}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {scaffoldComputations.length > 0 && (
        <div className="rounded-lg border border-border-primary bg-bg-surface p-4 space-y-3">
          <h2 className="text-sm font-medium text-text-secondary">Initialization Accounts ({scaffoldComputations.length})</h2>
          <p className="text-xs text-text-muted">Scaffold computation accounts created during MXE initialization. These are excluded from feeds and statistics.</p>
          <div className="space-y-2">
            {scaffoldComputations.map((comp) => (
              <Link
                key={comp.address}
                href={`/computations/${comp.address}?network=${network}`}
                className="flex items-center justify-between rounded-md border border-border-muted p-3 hover:bg-bg-elevated/50 transition-colors"
              >
                <AddressDisplay address={comp.address} showCopy={false} />
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  <span>Offset: {comp.computationOffset}</span>
                  <StatusBadge status={comp.status as ComputationStatus} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MxeDetailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center text-text-muted">Loading...</div>}>
      <MxeDetailContent />
    </Suspense>
  );
}
