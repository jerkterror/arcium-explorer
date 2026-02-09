import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getNetwork } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const network = getNetwork(req);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Send initial data
      try {
        const { db } = await import("@/lib/db");
        const schema = await import("@/lib/db/schema");

        const recent = await db
          .select()
          .from(schema.computations)
          .where(and(eq(schema.computations.network, network), eq(schema.computations.isScaffold, false)))
          .orderBy(desc(schema.computations.createdAt))
          .limit(10);

        sendEvent({ type: "initial", computations: recent });
      } catch {
        sendEvent({ type: "error", message: "Failed to load initial data" });
      }

      // Poll for updates every 5 seconds
      const interval = setInterval(async () => {
        try {
          const { db } = await import("@/lib/db");
          const schema = await import("@/lib/db/schema");

          const recent = await db
            .select()
            .from(schema.computations)
            .where(and(eq(schema.computations.network, network), eq(schema.computations.isScaffold, false)))
            .orderBy(desc(schema.computations.createdAt))
            .limit(5);

          sendEvent({ type: "update", computations: recent });
        } catch {
          // Silently continue on poll errors
        }
      }, 5000);

      // Clean up on close
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
