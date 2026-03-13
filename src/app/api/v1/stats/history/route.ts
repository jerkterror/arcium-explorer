import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getNetwork, errorResponse } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const network = getNetwork(req);
  const limit = Math.min(
    100,
    parseInt(req.nextUrl.searchParams.get("limit") || "50", 10)
  );

  try {
    const { db } = await import("@/lib/db");
    const schema = await import("@/lib/db/schema");

    const snapshots = await db
      .select()
      .from(schema.networkSnapshots)
      .where(eq(schema.networkSnapshots.network, network))
      .orderBy(desc(schema.networkSnapshots.timestamp))
      .limit(limit);

    return NextResponse.json(
      { data: snapshots.reverse(), meta: { network } },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("Stats history error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to fetch history"
    );
  }
}
