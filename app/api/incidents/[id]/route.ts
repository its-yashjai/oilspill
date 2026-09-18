import { NextRequest, NextResponse } from "next/server";
import { repo, serializeDates, withTransaction } from "@/lib/db/repo";
import { getDb } from "@/lib/db/index";
import { incidents, incidentImages, detectionRuns, agentRuns, findings, observations, timelineEvents, contextVersions, informationGaps, agentDisagreements, humanDecisions, notifications, reports, idempotencyKeys } from "@/lib/db/schema";
import { eq, like, or } from "drizzle-orm";
import { sendAlertIfNeeded } from "@/lib/email/sender";
import { withIdempotency, buildIdempotencyKey, getIdempotencyKeyFromRequest } from "@/lib/idempotency";
import { broadcastEvent } from "@/lib/livekit/broadcast";
import { randomUUID } from "node:crypto";

export async function GET(_:NextRequest, { params }:{ params:Promise<{id:string}>}){
  const { id } = await params;
  const incident = await repo.incidents.getById(id);
  if (!incident) return NextResponse.json({ error:"not found" }, { status:404 });
  const state = await import("@/lib/db/repo").then(m => m.getIncidentState(id));
  if(!state) return NextResponse.json({ error:"not found" }, { status:404 });
  // getIncidentState already returns serialized dates — no double serialize
  return NextResponse.json(state);
}

export async function PATCH(req:NextRequest, { params }:{ params:Promise<{id:string}>}){
  const { id } = await params;
  const body = await req.json().catch(()=>({}));
  const idemKey = getIdempotencyKeyFromRequest(req);

  const handler = async () => {
    const inc = await repo.incidents.getById(id);
    if(!inc) return NextResponse.json({ error:"not found"},{status:404});
    if(body.action==="escalate" || body.action==="mark_low_concern" || body.action==="resolve"){
      const severity = body.action==="escalate" ? "elevated" : body.action==="mark_low_concern" ? "low_concern" : "resolved";
      const status = body.action==="escalate" ? "escalated" : "resolved";
      const updated = await repo.incidents.update(id, { severity, status });
      const decision = await repo.humanDecisions.create({ id: randomUUID(), incidentId:id, action: body.action, reasoning: body.reasoning||"", contextVersion: updated!.contextVersion });
      const tl = await repo.timelineEvents.create({ id: randomUUID(), incidentId:id, type:"human_approval", payload:{ action: body.action, reasoning: body.reasoning, decision: serializeDates(decision) } });
      if(body.action==="escalate"){
        await sendAlertIfNeeded(id, updated!.contextVersion);
      }
      broadcastEvent(id, { type: "decision.created", eventId: randomUUID(), incidentId: id, timestamp: new Date().toISOString(), payload: { decision: serializeDates(decision), timeline: serializeDates(tl) } }).catch((err)=>{ console.warn(JSON.stringify({ route:"incidents/patch", event:"broadcast decision.created failed", incidentId:id, error:String(err?.message||err)})); });
      broadcastEvent(id, { type: "incident.status_changed", eventId: randomUUID(), incidentId: id, timestamp: new Date().toISOString(), payload: { status: updated!.status } }).catch((err)=>{ console.warn(JSON.stringify({ route:"incidents/patch", event:"broadcast status_changed failed", incidentId:id, error:String(err?.message||err)})); });
      return NextResponse.json({ incident: serializeDates(updated), decision: serializeDates(decision), timeline: serializeDates(tl), idempotent: false });
    }
    if(body.action==="request_more_evidence" || body.action==="request_evidence"){
      const decision = await repo.humanDecisions.create({ id: randomUUID(), incidentId:id, action:"request_evidence", reasoning: body.reasoning||"", contextVersion: inc.contextVersion });
      const tl2 = await repo.timelineEvents.create({ id: randomUUID(), incidentId:id, type:"human_approval", payload:{ action:"request_evidence", reasoning: body.reasoning, decision: serializeDates(decision) } });
      broadcastEvent(id, { type: "decision.created", eventId: randomUUID(), incidentId: id, timestamp: new Date().toISOString(), payload: { decision: serializeDates(decision), timeline: serializeDates(tl2) } }).catch((err)=>{ console.warn(JSON.stringify({ route:"incidents/patch", event:"broadcast decision.created failed", incidentId:id, error:String(err?.message||err)})); });
      return NextResponse.json({ incident: serializeDates(inc), decision: serializeDates(decision), timeline: serializeDates(tl2), idempotent: false });
    }
    if(body.status || body.severity){
      const updated = await repo.incidents.update(id, { ...(body.status ? { status: body.status } : {}), ...(body.severity ? { severity: body.severity } : {}) });
      broadcastEvent(id, { type: "incident.status_changed", eventId: randomUUID(), incidentId: id, timestamp: new Date().toISOString(), payload: { status: updated!.status } }).catch((err)=>{ console.warn(JSON.stringify({ route:"incidents/patch", event:"broadcast status_changed failed", incidentId:id, error:String(err?.message||err)})); });
      return NextResponse.json({ incident: serializeDates(updated), idempotent: false });
    }
    return NextResponse.json({ error:"invalid action"},{status:400});
  };

  if (idemKey) {
    const key = buildIdempotencyKey("incidents:patch", id, undefined, undefined, body.action || "update");
    try {
      const result = await withIdempotency(key, body, "incidents:patch", handler);
      return result instanceof NextResponse ? result : NextResponse.json(serializeDates(result as any));
    } catch (e) {
      if ((e as Error).message === "IDEMPOTENCY_CONFLICT: Same key used with different payload") {
        return NextResponse.json({ error: "Idempotency key conflict: same key with different payload" }, { status: 409 });
      }
      throw e;
    }
  }

  return await handler();
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await repo.incidents.getById(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { db } = getDb();
  for (const table of [reports, notifications, humanDecisions, agentDisagreements, informationGaps, contextVersions, timelineEvents, observations, findings, agentRuns, detectionRuns, incidentImages] as const) {
    try { await db.delete(table as any).where(eq((table as any).incidentId, id)); } catch (e:any) { console.warn(JSON.stringify({ route:"incidents/delete", event:"cleanup table failed", table:(table as any).incidentId ? "unknown" : "unknown", error:String(e?.message||e)})); }
  }
  try { await db.delete(idempotencyKeys).where(like(idempotencyKeys.key, `%:${id.toLowerCase()}%`)); } catch (e:any) { console.warn(JSON.stringify({ route:"incidents/delete", event:"idempotency cleanup failed", error:String(e?.message||e)})); }
  await db.delete(incidents).where(eq(incidents.id, id));
  return NextResponse.json({ deleted: id });
}
