import { NextRequest, NextResponse } from "next/server";
import { repo } from "@/lib/db/repo";
import { withIdempotency, buildIdempotencyKey, getIdempotencyKeyFromRequest } from "@/lib/idempotency";
import { serializeDates } from "@/lib/db/repo";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const agentType = body.agentType as "historical" | "investigation" | "evidence" | "all" | undefined;
  const validAgentTypes = ["historical", "investigation", "evidence", "all"] as const;

  if (!agentType || !validAgentTypes.includes(agentType)) {
    return NextResponse.json({ error: "Invalid agentType. Must be one of: historical, investigation, evidence, all" }, { status: 400 });
  }

  const incident = await repo.incidents.getById(id);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const idemKey = getIdempotencyKeyFromRequest(req);

  const handler = async () => {
    // Verify incident exists (re-fetched inside idempotency transaction boundary)
    const liveIncident = await repo.incidents.getById(id);
    if (!liveIncident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    // Import dynamically to avoid circular dependencies
    const { runCoordinatedInvestigation } = await import("@/lib/agents/coordinator");

    // Run the coordinated investigation with the current context version
    // skipIdempotency: true allows manual reruns to bypass inner agent idempotency, outer rerun idempotency still protects
    await runCoordinatedInvestigation(id, {
      skipIdempotency: true,
      contextVersion: undefined // use current incident contextVersion
    });

    return NextResponse.json({
      success: true,
      message: `Rerun completed for ${agentType === "all" ? "all agents" : agentType}`,
      agentRuns: {
        historical: "completed",
        investigation: "completed",
        evidence: "completed"
      }
    });
  };

  // Stable server-side key: incidentId + agentType + current contextVersion + rerun operation.
  // If client provides Idempotency-Key header, incorporate it deterministically; never use Date.now()/random per-request entropy.
  const serverKey = buildIdempotencyKey(`incidents:rerun:${agentType}`, id, undefined, incident.contextVersion, "rerun");
  const effectiveKey = idemKey
    ? buildIdempotencyKey(`incidents:rerun:${agentType}`, id, undefined, incident.contextVersion, `client-${idemKey}`)
    : serverKey;

  try {
    const result = await withIdempotency(effectiveKey, { agentType, incidentId: id, contextVersion: incident.contextVersion }, "incidents:rerun", handler);
    return result instanceof NextResponse ? result : NextResponse.json(serializeDates(result as any));
  } catch (e) {
    if ((e as Error).message === "IDEMPOTENCY_CONFLICT: Same key used with different payload") {
      return NextResponse.json({ error: "Idempotency key conflict: same key used with different payload" }, { status: 409 });
    }
    throw e;
  }
}