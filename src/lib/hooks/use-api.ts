"use client";

import { useQuery } from "@tanstack/react-query";
import { useNetwork } from "./use-network";
import type { ApiResponse, Network } from "@/types";

async function fetchApi<T>(path: string, network: Network): Promise<ApiResponse<T>> {
  const separator = path.includes("?") ? "&" : "?";
  const res = await fetch(`${path}${separator}network=${network}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function useStats() {
  const network = useNetwork();
  return useQuery({
    queryKey: ["stats", network],
    queryFn: () => fetchApi("/api/v1/stats", network),
  });
}

export function useClusters(page = 1, limit = 20) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["clusters", network, page, limit],
    queryFn: () =>
      fetchApi(`/api/v1/clusters?page=${page}&limit=${limit}`, network),
  });
}

export function useCluster(offset: number) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["cluster", network, offset],
    queryFn: () => fetchApi(`/api/v1/clusters/${offset}`, network),
  });
}

export function useNodes(page = 1, limit = 20, filters?: { cluster?: number; active?: boolean }) {
  const network = useNetwork();
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters?.cluster !== undefined) params.set("cluster", String(filters.cluster));
  if (filters?.active) params.set("active", "true");
  return useQuery({
    queryKey: ["nodes", network, page, limit, filters],
    queryFn: () => fetchApi(`/api/v1/nodes?${params}`, network),
  });
}

export function useNode(offset: number) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["node", network, offset],
    queryFn: () => fetchApi(`/api/v1/nodes/${offset}`, network),
  });
}

export function useComputations(
  page = 1,
  limit = 20,
  filters?: { status?: string; cluster?: number; program?: string; scaffold?: string }
) {
  const network = useNetwork();
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters?.status) params.set("status", filters.status);
  if (filters?.cluster !== undefined) params.set("cluster", String(filters.cluster));
  if (filters?.program) params.set("program", filters.program);
  if (filters?.scaffold) params.set("scaffold", filters.scaffold);
  return useQuery({
    queryKey: ["computations", network, page, limit, filters],
    queryFn: () => fetchApi(`/api/v1/computations?${params}`, network),
  });
}

export function useComputation(id: string) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["computation", network, id],
    queryFn: () => fetchApi(`/api/v1/computations/${id}`, network),
  });
}

export function usePrograms(page = 1, limit = 20) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["programs", network, page, limit],
    queryFn: () => fetchApi(`/api/v1/programs?page=${page}&limit=${limit}`, network),
  });
}

export function useProgram(address: string) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["program", network, address],
    queryFn: () => fetchApi(`/api/v1/programs/${address}`, network),
  });
}

export function useMxes(page = 1, limit = 20) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["mxes", network, page, limit],
    queryFn: () => fetchApi(`/api/v1/mxes?page=${page}&limit=${limit}`, network),
  });
}

export function useMxe(address: string) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["mxe", network, address],
    queryFn: () => fetchApi(`/api/v1/mxes/${address}`, network),
  });
}

export function useDefinitions(page = 1, limit = 20) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["definitions", network, page, limit],
    queryFn: () => fetchApi(`/api/v1/definitions?page=${page}&limit=${limit}`, network),
  });
}

export function useDefinition(address: string) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["definition", network, address],
    queryFn: () => fetchApi(`/api/v1/definitions/${address}`, network),
  });
}

export function useSearch(query: string) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["search", network, query],
    queryFn: () =>
      fetchApi(`/api/v1/search?q=${encodeURIComponent(query)}`, network),
    enabled: query.length > 0,
  });
}

export function useStatsHistory(limit = 50) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["stats-history", network, limit],
    queryFn: () => fetchApi(`/api/v1/stats/history?limit=${limit}`, network),
  });
}
