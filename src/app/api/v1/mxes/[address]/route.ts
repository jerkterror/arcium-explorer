import { NextRequest } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { getNetwork, jsonResponse, errorResponse } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const network = getNetwork(req);

  try {
    const { db } = await import("@/lib/db");
    const schema = await import("@/lib/db/schema");

    const [mxe] = await db
      .select()
      .from(schema.mxeAccounts)
      .where(
        and(
          eq(schema.mxeAccounts.address, address),
          eq(schema.mxeAccounts.network, network)
        )
      )
      .limit(1);

    if (!mxe) {
      return errorResponse("MXE not found", 404);
    }

    // Fetch comp defs
    const compDefs = await db
      .select()
      .from(schema.computationDefinitions)
      .where(
        and(
          eq(schema.computationDefinitions.mxeProgramId, mxe.mxeProgramId),
          eq(schema.computationDefinitions.network, network)
        )
      );

    // Fetch scaffold computations for this MXE
    const scaffoldComputations = await db
      .select()
      .from(schema.computations)
      .where(
        and(
          eq(schema.computations.mxeProgramId, mxe.mxeProgramId),
          eq(schema.computations.network, network),
          eq(schema.computations.isScaffold, true)
        )
      )
      .orderBy(desc(schema.computations.createdAt));

    return jsonResponse(
      { ...mxe, computationDefinitions: compDefs, scaffoldComputations },
      { network }
    );
  } catch (error) {
    console.error("MXE detail error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to fetch MXE"
    );
  }
}
