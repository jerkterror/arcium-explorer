import { NextRequest } from "next/server";
import { count, eq, and } from "drizzle-orm";
import { getNetwork, jsonResponse, errorResponse } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const network = getNetwork(req);

  try {
    const { db } = await import("@/lib/db");
    const schema = await import("@/lib/db/schema");

    const [clusterCount] = await db
      .select({ count: count() })
      .from(schema.clusters)
      .where(eq(schema.clusters.network, network));

    const [nodeCount] = await db
      .select({ count: count() })
      .from(schema.arxNodes)
      .where(eq(schema.arxNodes.network, network));

    const [activeNodeCount] = await db
      .select({ count: count() })
      .from(schema.arxNodes)
      .where(
        and(eq(schema.arxNodes.network, network), eq(schema.arxNodes.isActive, true))
      );

    const [computationCount] = await db
      .select({ count: count() })
      .from(schema.computations)
      .where(and(eq(schema.computations.network, network), eq(schema.computations.isScaffold, false)));

    const [queuedCount] = await db
      .select({ count: count() })
      .from(schema.computations)
      .where(
        and(
          eq(schema.computations.network, network),
          eq(schema.computations.status, "queued"),
          eq(schema.computations.isScaffold, false)
        )
      );

    const [executingCount] = await db
      .select({ count: count() })
      .from(schema.computations)
      .where(
        and(
          eq(schema.computations.network, network),
          eq(schema.computations.status, "executing"),
          eq(schema.computations.isScaffold, false)
        )
      );

    const [finalizedCount] = await db
      .select({ count: count() })
      .from(schema.computations)
      .where(
        and(
          eq(schema.computations.network, network),
          eq(schema.computations.status, "finalized"),
          eq(schema.computations.isScaffold, false)
        )
      );

    const [programCount] = await db
      .select({ count: count() })
      .from(schema.programs)
      .where(eq(schema.programs.network, network));

    const [mxeCount] = await db
      .select({ count: count() })
      .from(schema.mxeAccounts)
      .where(eq(schema.mxeAccounts.network, network));

    return jsonResponse(
      {
        totalClusters: clusterCount.count,
        totalNodes: nodeCount.count,
        activeNodes: activeNodeCount.count,
        totalComputations: computationCount.count,
        queuedComputations: queuedCount.count,
        executingComputations: executingCount.count,
        finalizedComputations: finalizedCount.count,
        totalPrograms: programCount.count,
        totalMxes: mxeCount.count,
      },
      { network }
    );
  } catch (error) {
    console.error("Stats API error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to fetch stats"
    );
  }
}
