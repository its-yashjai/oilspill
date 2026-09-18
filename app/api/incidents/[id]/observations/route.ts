import { NextRequest, NextResponse } from "next/server";
import { repo, serializeDates, incrementContext } from "@/lib/db/repo";
import { runCoordinatedInvestigation } from "@/lib/agents/coordinator";
import { withIdempotency, buildIdempotencyKey, getIdempotencyKeyFromRequest } from "@/lib/idempotency";
import { broadcastEvent } from "@/lib/livekit/broadcast";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest, { params }:{ params:Promise<{id:string}>}){
  const { id } = await params;
  const body = await req.json().catch(()=>({}));
  const text = (body.text||"").toString().trim();
  if(text.length < 2) return NextResponse.json({ error:"text too short"},{status:400});
  const idemKey = getIdempotencyKeyFromRequest(req);

  const handler = async () => {
    const incident = await repo.incidents.getById(id);
    if(!incident) return NextResponse.json({ error:"not found"},{status:404});
    // Critical persistence: observation, timeline, context increment must complete before response
    const obs = await repo.observations.create({ id: randomUUID(), incidentId:id, author: body.author||"operator", authorType:"human", text });
    const obsTimeline = await repo.timelineEvents.create({ id: randomUUID(), incidentId:id, type:"human_observation_added", payload:{ observation: serializeDates(obs) } });
    const newVersion = await incrementContext(id, { observation: serializeDates(obs), text });
    const staleFindings = (await repo.findings.listByIncident(id)).filter((f) => f.status==="stale");
    const ctxRows = await repo.contextVersions.listByIncident(id);
    const ctx = ctxRows.find((c) => c.version === newVersion);
    await repo.timelineEvents.create({ id: randomUUID(), incidentId:id, type:"reassessment_started", payload:{ version:newVersion, stale: staleFindings.map((f) => f.id) } });
    const observationEvent = { type: "observation.created", eventId: randomUUID(), incidentId: id, timestamp: new Date().toISOString(), payload: { observation: serializeDates(obs), timeline: serializeDates(obsTimeline) } };
    // Broadcasts are best-effort with structured logging
    broadcastEvent(id, observationEvent).catch((err)=>{ console.warn(JSON.stringify({ route:"observations", event:"broadcast observation.created failed", incidentId: id, error:String(err?.message||err)})); });
    for (const f of staleFindings) broadcastEvent(id, { type: "finding.stale", eventId: randomUUID(), incidentId: id, timestamp: new Date().toISOString(), payload: { findingId: f.id, status: f.status } }).catch((err)=>{ console.warn(JSON.stringify({ route:"observations", event:"broadcast finding.stale failed", incidentId: id, error:String(err?.message||err)})); });
    broadcastEvent(id, { type: "context.updated", eventId: randomUUID(), incidentId: id, timestamp: new Date().toISOString(), payload: { contextVersion: newVersion, context: serializeDates(ctx) } }).catch((err)=>{ console.warn(JSON.stringify({ route:"observations", event:"broadcast context.updated failed", incidentId: id, error:String(err?.message||err)})); });
    broadcastEvent(id, { type: "timeline.created", eventId: randomUUID(), incidentId: id, timestamp: new Date().toISOString(), payload: observationEvent }).catch((err)=>{ console.warn(JSON.stringify({ route:"observations", event:"broadcast timeline.created failed", incidentId: id, error:String(err?.message||err)})); });
    // Background reassessment — do not block response on LLM/agent completion
    setImmediate(() => {
      runCoordinatedInvestigation(id).catch((err) => {
        console.error(JSON.stringify({ route:"observations", event:"reassessment failed", incidentId: id, error:String(err?.message||err)}));
      });
    });
    return NextResponse.json({ observation: serializeDates(obs), timeline: serializeDates(obsTimeline), context: serializeDates(ctx), contextVersion: newVersion, idempotent: false });
  };

  if (idemKey) {
    const key = buildIdempotencyKey("incidents:observations", id);
    try {
      const result = await withIdempotency(key, body, "incidents:observations", handler);
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
