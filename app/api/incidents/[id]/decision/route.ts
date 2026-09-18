import { NextRequest, NextResponse } from "next/server";
import { repo, serializeDates } from "@/lib/db/repo";
import { decisionSchema } from "@/lib/validation";
import { sendAlertIfNeeded } from "@/lib/email/sender";
import { withIdempotency, buildIdempotencyKey, getIdempotencyKeyFromRequest } from "@/lib/idempotency";
import { broadcastEvent } from "@/lib/livekit/broadcast";
import { randomUUID } from "node:crypto";
import { runCoordinatedInvestigation } from "@/lib/agents/coordinator";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid decision", issues: parsed.error.flatten() }, { status: 400 });
  const { action, reasoning } = parsed.data;
  const idemKey = getIdempotencyKeyFromRequest(req);

  const handler = async () => {
    const inc = await repo.incidents.getById(id);
    if (!inc) return NextResponse.json({ error: "not found" }, { status: 404 });
    let incidentStatus = inc.status;
    let severity = inc.severity;
    if (action === "escalate") { severity = "elevated"; incidentStatus = "escalated"; }
    else if (action === "mark_low_concern") { severity = "low_concern"; incidentStatus = "resolved"; }
    else if (action === "resolve") { severity = "resolved"; incidentStatus = "resolved"; }
    const updated = action === "request_evidence" ? inc : await repo.incidents.update(id, { severity, status: incidentStatus });
    const decision = await repo.humanDecisions.create({ id: randomUUID(), incidentId: id, action, reasoning: reasoning || "", contextVersion: (updated ?? inc).contextVersion });
    const timeline = await repo.timelineEvents.create({ id: randomUUID(), incidentId: id, type: "human_approval", payload: { action, reasoning, decision: serializeDates(decision) } });
    if (action === "escalate") await sendAlertIfNeeded(id, (updated ?? inc).contextVersion);
    
    // Broadcast decision events (graceful degradation, structural logging on failure)
    broadcastEvent(id, { type: "decision.created", eventId: randomUUID(), incidentId: id, timestamp: new Date().toISOString(), payload: { decision: serializeDates(decision), timeline: serializeDates(timeline) } }).catch((err)=>{ console.warn(JSON.stringify({ route:"decision", event:"broadcast decision.created failed", incidentId: id, error:String(err?.message||err) })); });
    broadcastEvent(id, { type: "incident.status_changed", eventId: randomUUID(), incidentId: id, timestamp: new Date().toISOString(), payload: { status: (updated ?? inc).status } }).catch((err)=>{ console.warn(JSON.stringify({ route:"decision", event:"broadcast status_changed failed", incidentId: id, error:String(err?.message||err) })); });
    broadcastEvent(id, { type: "timeline.created", eventId: randomUUID(), incidentId: id, timestamp: new Date().toISOString(), payload: { decision: serializeDates(decision) } }).catch((err)=>{ console.warn(JSON.stringify({ route:"decision", event:"broadcast timeline.created failed", incidentId: id, error:String(err?.message||err) })); });
    
    // If requesting more evidence, trigger reassessment asynchronously (background, with logging)
    if (action === "request_evidence") {
      setImmediate(() => {
        runCoordinatedInvestigation(id).catch((err) => {
          console.error(JSON.stringify({ route:"decision", event:"reassessment failed", incidentId: id, error:String(err?.message||err) }));
        });
      });
    }
    
    return NextResponse.json({ decision: serializeDates(decision), incidentStatus: (updated ?? inc).status, timeline: serializeDates(timeline), idempotent: false });
  };

  // Single idempotency wrapper: use client header when provided, otherwise stable server key derived from incidentId + action.
  const serverKey = buildIdempotencyKey("incidents:decision", id, undefined, undefined, action);
  const effectiveKey = idemKey
    ? buildIdempotencyKey("incidents:decision", id, undefined, undefined, `client-${idemKey}`)
    : serverKey;
  try {
    const result = await withIdempotency(effectiveKey, { action, reasoning }, "incidents:decision", handler);
    return result instanceof NextResponse ? result : NextResponse.json(serializeDates(result as any));
  } catch (e) {
    if ((e as Error).message === "IDEMPOTENCY_CONFLICT: Same key used with different payload") {
      return NextResponse.json({ error: "Idempotency key conflict: same key with different payload" }, { status: 409 });
    }
    throw e;
  }
}
