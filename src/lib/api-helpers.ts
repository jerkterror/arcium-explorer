import { NextRequest, NextResponse } from "next/server";
import type { Network } from "@/types";
import { DEFAULT_NETWORK, DEFAULT_PAGE_SIZE } from "@/lib/constants";

export function getNetwork(req: NextRequest): Network {
  const network = req.nextUrl.searchParams.get("network");
  if (network === "mainnet" || network === "devnet") return network;
  return DEFAULT_NETWORK;
}

export function getPagination(req: NextRequest) {
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || String(DEFAULT_PAGE_SIZE), 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function jsonResponse<T>(
  data: T,
  meta: { network: Network; page?: number; limit?: number; total?: number }
) {
  return NextResponse.json({ data, meta });
}

export function errorResponse(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}

