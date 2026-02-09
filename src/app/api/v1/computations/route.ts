import { NextRequest } from "next/server";
import { eq, and, desc, count } from "drizzle-orm";
import { getNetwork, getPagination, jsonResponse, errorResponse } from "@/lib/api-helpers";
import type { ComputationStatus } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const network = getNetwork(req);
  const { page, limit, offset } = getPagination(req);
  const statusFilter = req.nextUrl.searchParams.get("status") as ComputationStatus | null;
  const clusterFilter = req.nextUrl.searchParams.get("cluster");
  const programFilter = req.nextUrl.searchParams.get("program");
  const scaffoldFilter = req.nextUrl.searchParams.get("scaffold");

  try {
    const { db } = await import("@/lib/db");
    const { computations } = await import("@/lib/db/schema");

    let whereClause = eq(computations.network, network);

    // scaffold filter: omitted or "false" → exclude, "true" → only scaffolds, "all" → no filter
    if (scaffoldFilter === "true") {
      whereClause = and(whereClause, eq(computations.isScaffold, true))!;
    } else if (scaffoldFilter !== "all") {
      whereClause = and(whereClause, eq(computations.isScaffold, false))!;
    }

    if (statusFilter && ["queued", "executing", "finalized", "failed"].includes(statusFilter)) {
      whereClause = and(whereClause, eq(computations.status, statusFilter))!;
    }
    if (clusterFilter) {
      const co = parseInt(clusterFilter, 10);
      if (!isNaN(co)) {
        whereClause = and(whereClause, eq(computations.clusterOffset, co))!;
      }
    }
    if (programFilter) {
      whereClause = and(whereClause, eq(computations.mxeProgramId, programFilter))!;
    }

    const [totalResult] = await db
      .select({ count: count() })
      .from(computations)
      .where(whereClause);

    const data = await db
      .select()
      .from(computations)
      .where(whereClause)
      .orderBy(desc(computations.createdAt))
      .limit(limit)
      .offset(offset);

    return jsonResponse(data, {
      network,
      page,
      limit,
      total: totalResult.count,
    });
  } catch (error) {
    console.error("Computations API error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to fetch computations"
    );
  }
}
