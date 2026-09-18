import { runHistoricalAgent } from "./historical";
import { runInvestigationAgent } from "./investigation";
import { runEvidenceAgent } from "./evidence";
import { repo, serializeDates } from "../db/repo";
import { withIdempotency, buildIdempotencyKey } from "../idempotency";
import { broadcastEvent } from "../livekit/broadcast";
import { randomUUID } from "node:crypto";


const AGENT_TIMEOUT_MS = 30000;

export async function runCoordinatedInvestigation(incidentId: string, options?: { skipIdempotency?: boolean; contextVersion?: number }){
  const incident = await repo.incidents.getById(incidentId);
  if(!incident) throw new Error("incident not found");
  const detections = await repo.detectionRuns.listByIncident(incidentId);
  const detection = detections.at(-1);
  const contextVersion = options?.contextVersion ?? incident.contextVersion;

  const runAgents = async () => {
    const start = Date.now();
    
    // Canonical upsert for agent run records (preserve queued→running→completed/failed lifecycle)
    async function ensureAgentRun(agentType: string, status: string) {
      const runs = await repo.agentRuns.listByIncident(incidentId);
      const existing = runs.find(r => r.agentType === agentType && r.contextVersion === contextVersion);
      if (existing) {
        await repo.agentRuns.update(existing.id, { status, updatedAt: new Date() } as any);
        return existing;
      }
      return repo.agentRuns.create({ id: randomUUID(), incidentId, agentType, status, contextVersion } as any);
    }
    await ensureAgentRun("historical", "running");
    await ensureAgentRun("investigation", "running");
    await ensureAgentRun("evidence", "waiting");

    // Broadcast agent started events (graceful degradation with logging)
    await broadcastEvent(incidentId, { type: "agent.started", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { agentType: "historical", contextVersion } }).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast agent.started failed", agentType:"historical", error:String(err?.message||err)})); });
    await broadcastEvent(incidentId, { type: "agent.started", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { agentType: "investigation", contextVersion } }).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast agent.started failed", agentType:"investigation", error:String(err?.message||err)})); });

    // Run Historical and Investigation in parallel
    const histP = withTimeout(runHistoricalAgent(serializeDates(incident), serializeDates(detection), contextVersion), 30000, "historical");
    const invP = (async ()=>{
      const hist = await histP.catch(()=>null);
      return runInvestigationAgent(serializeDates(incident), serializeDates(detection), hist ? serializeDates(hist) : null, contextVersion);
    })();

    const [hist, inv] = await Promise.allSettled([
      histP.catch(e=>({ error:e.message, agentType:"historical", summary:"Historical agent error", confidence:0.3, supportingEvidence:[], contradictoryEvidence:[String(e)], informationNeeded:[], mossEvidenceIds:[], contextVersion, dependsOn:[], status:"active", createdAt:new Date().toISOString(), mossLatencyMs: 0 })),
      invP.catch(e=>({ error:e.message, agentType:"investigation", summary:"Investigation error", confidence:0.3, supportingEvidence:[], contradictoryEvidence:[String(e)], informationNeeded:[], mossEvidenceIds:[], contextVersion, dependsOn:[], status:"active", createdAt:new Date().toISOString(), mossLatencyMs: 0 }))
    ]);

    // Update agent runs status (canonical repo path)
    await updateAgentRunStatus(incidentId, "historical", hist.status === "fulfilled" ? "completed" : "failed");
    await broadcastEvent(incidentId, { type: "agent.completed", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { agentType: "historical", contextVersion } }).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast agent.completed failed", agentType:"historical", error:String(err?.message||err)})); });
    
    await updateAgentRunStatus(incidentId, "investigation", inv.status === "fulfilled" ? "completed" : "failed");
    await broadcastEvent(incidentId, { type: "agent.completed", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { agentType: "investigation", contextVersion } }).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast agent.completed failed", agentType:"investigation", error:String(err?.message||err)})); });

    const histVal = hist.status === "fulfilled" ? hist.value : null;
    const invVal = inv.status === "fulfilled" ? inv.value : null;
    
    const histRow = histVal ? await persistFinding(incidentId, histVal) : null;
    const invRow = invVal ? await persistFinding(incidentId, invVal) : null;

    if (histRow) {
      const histFindingEvent = { type: "finding.created", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { finding: serializeDates(histRow) } };
      await repo.timelineEvents.create({ id: randomUUID(), incidentId, type:"finding_created", payload:{ agent:"historical", finding: serializeDates(histRow) } });
      broadcastEvent(incidentId, histFindingEvent).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast finding.created failed", agentType:"historical", error:String(err?.message||err)})); });
      broadcastEvent(incidentId, { type: "timeline.created", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: histFindingEvent }).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast timeline.created failed", error:String(err?.message||err)})); });
    }
    
    if (invRow) {
      const invFindingEvent = { type: "finding.created", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { finding: serializeDates(invRow) } };
      await repo.timelineEvents.create({ id: randomUUID(), incidentId, type:"finding_created", payload:{ agent:"investigation", finding: serializeDates(invRow) } });
      broadcastEvent(incidentId, invFindingEvent).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast finding.created failed", agentType:"investigation", error:String(err?.message||err)})); });
      broadcastEvent(incidentId, { type: "timeline.created", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { finding: serializeDates(invRow) } }).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast timeline.created failed", error:String(err?.message||err)})); });
    }

    // Broadcast agent completion
    await broadcastEvent(incidentId, { type: "agent.completed", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { agentType: "historical", contextVersion } }).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast agent.completed duplicate failed", error:String(err?.message||err)})); });
    await broadcastEvent(incidentId, { type: "agent.completed", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { agentType: "investigation", contextVersion } }).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast agent.completed duplicate failed", error:String(err?.message||err)})); });

    // Update evidence agent to running (canonical repo)
    await updateAgentRunStatus(incidentId, "evidence", "running");
    await broadcastEvent(incidentId, { type: "agent.started", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { agentType: "evidence", contextVersion } }).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast evidence started failed", error:String(err?.message||err)})); });

    // Run Evidence agent with Historical and Investigation results
    const evidence = await runEvidenceAgent(serializeDates(incident), serializeDates(detection), [histRow, invRow].filter(Boolean), contextVersion).catch(e=>null);
    
    if(evidence){
      const evRow = await persistFinding(incidentId, evidence);
      const evEvent = { type: "finding.created", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { finding: serializeDates(evRow) } };
      await repo.timelineEvents.create({ id: randomUUID(), incidentId, type:"finding_created", payload:{ agent:"evidence", finding: serializeDates(evRow) } });
      broadcastEvent(incidentId, evEvent).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast evidence finding failed", error:String(err?.message||err)})); });
      
      if(evidence.disagreement){
        await repo.informationGaps.create({ id: randomUUID(), incidentId, contextVersion, gaps: evidence.informationNeeded });
        await repo.agentDisagreements.create({ id: randomUUID(), incidentId, contextVersion, reason: evidence.disagreementReason, details: serializeDates(evidence) as any });
        await repo.timelineEvents.create({ id: randomUUID(), incidentId, type:"disagreement_detected", payload:{ reason: evidence.disagreementReason } });
      } else {
        await repo.informationGaps.create({ id: randomUUID(), incidentId, contextVersion, gaps: evidence.informationNeeded });
      }
      broadcastEvent(incidentId, { type: "timeline.created", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { finding: serializeDates(evidence) } }).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast timeline.created failed", error:String(err?.message||err)})); });
      await broadcastEvent(incidentId, { type: "agent.completed", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { agentType: "evidence", contextVersion } }).catch((err)=>{ console.warn(JSON.stringify({ route:"coordinator", event:"broadcast evidence completed failed", error:String(err?.message||err)})); });
      await repo.incidents.update(incidentId, {});
      return { hist: serializeDates(histRow), inv: serializeDates(invRow), evidence: serializeDates(evidence), totalMs: Date.now()-start };
    }
    
    await repo.incidents.update(incidentId, {});
    return { hist: histRow ? serializeDates(histRow) : null, inv: invRow ? serializeDates(invRow) : null, evidence: null, totalMs: Date.now()-start };
  };

  const runAgentsWithRetry = async () => {
    // Update evidence agent to waiting
    await updateAgentRunStatus(incidentId, "evidence", "waiting");
    return runAgents();
  };

  if (options?.skipIdempotency) {
    return runAgentsWithRetry();
  }

  const key = buildIdempotencyKey("agents:run", incidentId, undefined, contextVersion);
  try {
    return await withIdempotency(key, { incidentId, contextVersion }, "agents:run", runAgentsWithRetry);
  } catch (e) {
    if ((e as Error).message === "IDEMPOTENCY_CONFLICT: Same key used with different payload") {
      throw new Error("Agent run idempotency conflict");
    }
    throw e;
  }
}

async function updateAgentRunStatus(incidentId: string, agentType: string, status: string, error?: string) {
  const runs = await repo.agentRuns.listByIncident(incidentId);
  const run = runs.find(r => r.agentType === agentType);
  if (run) {
    // Canonical repository-based update (no direct getDb().db)
    await repo.agentRuns.update(run.id, { status, ...(error !== undefined ? { error } : {}), updatedAt: new Date() } as any);
    if (status === "failed" && error) {
      console.warn(JSON.stringify({ route:"coordinator", event:"agent failed", agentType, incidentId, error }));
    }
  } else {
    // Fallback create if missing (defensive)
    await repo.agentRuns.create({ id: randomUUID(), incidentId, agentType, status, error, contextVersion: 1 } as any);
  }
}

async function persistFinding(incidentId: string, f: any) {
  return repo.findings.create({ 
    id: f.id || randomUUID(), 
    incidentId, 
    agentType: f.agentType, 
    summary: f.summary, 
    confidence: f.confidence, 
    supportingEvidence: f.supportingEvidence, 
    contradictoryEvidence: f.contradictoryEvidence, 
    informationNeeded: f.informationNeeded, 
    mossEvidenceIds: f.mossEvidenceIds, 
    contextVersion: f.contextVersion, 
    dependsOn: f.dependsOn, 
    status: f.status || "active", 
    mossLatencyMs: f.mossLatencyMs != null ? Math.round(f.mossLatencyMs) : null, 
    raw: f.raw 
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), 30000);
    promise.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); }
    );
  });
}