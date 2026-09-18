import { randomUUID } from "node:crypto";
import { repo, serializeDates } from "../db/repo";
import { getDb } from "../db/index";
import { agentRuns } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { runHistoricalAgent } from "./historical";
import { runInvestigationAgent } from "./investigation";
import { runEvidenceAgent } from "./evidence";
import { broadcastEvent } from "../livekit/broadcast";

const AGENT_TIMEOUT_MS = 20000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

async function updateAgentRun(incidentId: string, agentType: string, status: string, extra: Record<string, unknown> = {}) {
  if (!(await repo.incidents.getById(incidentId))) return null;
  const runs = await repo.agentRuns.listByIncident(incidentId);
  const run = runs.find(r => r.agentType === agentType);
  if (run) {
    // Canonical repository-based update (no direct getDb().db mix)
    return repo.agentRuns.update(run.id, { status, ...extra, updatedAt: new Date() } as any);
  }
  return repo.agentRuns.create({ id: randomUUID(), incidentId, agentType, status, ...extra } as any);
}

async function broadcastAgent(incidentId: string, type: string, agentType: string) {
  await broadcastEvent(incidentId, { type, eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { agentType } }).catch((err)=>{ console.warn(JSON.stringify({ route:"pipeline", event:`broadcast ${type} failed`, agentType, incidentId, error:String(err?.message||err)})); });
}

export async function tryStartEvidence(incidentId: string) {
  if (!(await repo.incidents.getById(incidentId))) return;
  const runs = await repo.agentRuns.listByIncident(incidentId);
  const histRun = runs.find(r => r.agentType === "historical");
  const invRun = runs.find(r => r.agentType === "investigation");
  const histTerminal = histRun && ["completed","failed","error"].includes(histRun.status);
  const invTerminal = invRun && ["completed","failed","error"].includes(invRun.status);
  if (!histTerminal || !invTerminal) return;
  const { db } = getDb();
  const claimed = await db.update(agentRuns).set({ status: "running", updatedAt: new Date() }).where(and(eq(agentRuns.incidentId, incidentId), eq(agentRuns.agentType, "evidence"), eq(agentRuns.status, "queued"))).returning();
  if (claimed.length === 0) return;
  await broadcastAgent(incidentId, "agent.started", "evidence");
  const incident = await repo.incidents.getById(incidentId);
  if (!incident) return;
  const detections = await repo.detectionRuns.listByIncident(incidentId);
  const detection = detections.at(-1);
  const findings = await repo.findings.listByIncident(incidentId);
  const hist = findings.find(f => f.agentType === "historical" && f.contextVersion === incident!.contextVersion);
  const inv = findings.find(f => f.agentType === "investigation" && f.contextVersion === incident!.contextVersion);
  const histFailed = !hist;
  const invFailed = !inv;
  try {
    const evidence = await withTimeout(runEvidenceAgent(serializeDates(incident), serializeDates(detection), [hist, inv].filter(Boolean), incident!.contextVersion), AGENT_TIMEOUT_MS, "evidence");
    if (!(await repo.incidents.getById(incidentId))) return;
    const row = await repo.findings.create({ id: (evidence as any).id || randomUUID(), incidentId, agentType: "evidence", summary: (evidence as any).summary, confidence: (evidence as any).confidence, supportingEvidence: (evidence as any).supportingEvidence, contradictoryEvidence: (evidence as any).contradictoryEvidence, informationNeeded: (evidence as any).informationNeeded, mossEvidenceIds: (evidence as any).mossEvidenceIds, contextVersion: (evidence as any).contextVersion, dependsOn: (evidence as any).dependsOn, status: "active", mossLatencyMs: (evidence as any).mossLatencyMs ? Math.round((evidence as any).mossLatencyMs) : null, raw: { ...(evidence as any).raw, upstream: { histFailed, invFailed } } });
    await repo.timelineEvents.create({ id: randomUUID(), incidentId, type: "finding_created", payload: { agent: "evidence", finding: serializeDates(row) } });
    if ((evidence as any).disagreement) {
      await repo.informationGaps.create({ id: randomUUID(), incidentId, contextVersion: incident!.contextVersion, gaps: (evidence as any).informationNeeded });
      await repo.agentDisagreements.create({ id: randomUUID(), incidentId, contextVersion: incident!.contextVersion, reason: (evidence as any).disagreementReason, details: serializeDates(evidence) as any });
    } else {
      await repo.informationGaps.create({ id: randomUUID(), incidentId, contextVersion: incident!.contextVersion, gaps: (evidence as any).informationNeeded });
    }
    await updateAgentRun(incidentId, "evidence", "completed", { latencyMs: Date.now() - new Date(claimed[0].createdAt).getTime() });
    await broadcastEvent(incidentId, { type: "finding.created", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { finding: serializeDates(row) } }).catch((err)=>{ console.warn(JSON.stringify({ route:"pipeline", event:"broadcast finding.created failed", incidentId, error:String(err?.message||err)})); });
    await broadcastAgent(incidentId, "agent.completed", "evidence");
  } catch (e: any) {
    if (!(await repo.incidents.getById(incidentId))) return;
    await updateAgentRun(incidentId, "evidence", "failed", { error: String(e?.message || e).slice(0,500) });
    await broadcastAgent(incidentId, "agent.failed", "evidence");
    try {
      if (!(await repo.incidents.getById(incidentId))) return;
      const row = await repo.findings.create({ id: randomUUID(), incidentId, agentType: "evidence", summary: `Evidence incomplete — upstream ${histFailed?"historical ":""}${invFailed?"investigation ":""}failed. Human review required.`, confidence: 0.35, supportingEvidence: [], contradictoryEvidence: [String(e?.message||e)], informationNeeded: ["second temporal observation","wind/current data"], mossEvidenceIds: [], contextVersion: incident!.contextVersion, dependsOn: [], status: "active", mossLatencyMs: null, raw: { error: String(e?.message||e), upstream: { histFailed, invFailed } } });
      await broadcastEvent(incidentId, { type: "finding.created", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { finding: serializeDates(row) } }).catch((err)=>{ console.warn(JSON.stringify({ route:"pipeline", event:"broadcast fallback finding failed", incidentId, error:String(err?.message||err)})); });
    } catch (err:any) { console.warn(JSON.stringify({ route:"pipeline", event:"fallback evidence finding failed", incidentId, error:String(err?.message||err)})); }
  }
}

export async function runDemoPipeline(incidentId: string) {
  if (!(await repo.incidents.getById(incidentId))) return;
  const incident = await repo.incidents.getById(incidentId);
  if (!incident) return;
  const detections = await repo.detectionRuns.listByIncident(incidentId);
  const detection = detections.at(-1);
  const version = incident.contextVersion;

  const runBranch = async (agentType: "historical" | "investigation", fn: () => Promise<any>) => {
    if (!(await repo.incidents.getById(incidentId))) return null;
    await updateAgentRun(incidentId, agentType, "running");
    await broadcastAgent(incidentId, "agent.started", agentType);
    const start = Date.now();
    try {
      const result = await withTimeout(fn(), AGENT_TIMEOUT_MS, agentType);
      if (!(await repo.incidents.getById(incidentId))) return null;
      const row = await repo.findings.create({ id: (result as any).id || randomUUID(), incidentId, agentType, summary: (result as any).summary, confidence: (result as any).confidence, supportingEvidence: (result as any).supportingEvidence, contradictoryEvidence: (result as any).contradictoryEvidence, informationNeeded: (result as any).informationNeeded, mossEvidenceIds: (result as any).mossEvidenceIds, contextVersion: (result as any).contextVersion, dependsOn: (result as any).dependsOn, status: "active", mossLatencyMs: (result as any).mossLatencyMs ? Math.round((result as any).mossLatencyMs) : null, raw: (result as any).raw });
      await repo.timelineEvents.create({ id: randomUUID(), incidentId, type: "finding_created", payload: { agent: agentType, finding: serializeDates(row) } });
      await updateAgentRun(incidentId, agentType, "completed", { latencyMs: Date.now() - start });
      await broadcastEvent(incidentId, { type: "finding.created", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { finding: serializeDates(row) } }).catch((err)=>{ console.warn(JSON.stringify({ route:"pipeline", event:"broadcast finding.created failed", incidentId, agentType, error:String(err?.message||err)})); });
      await broadcastAgent(incidentId, "agent.completed", agentType);
      return row;
    } catch (e: any) {
      if (!(await repo.incidents.getById(incidentId))) return null;
      await updateAgentRun(incidentId, agentType, "failed", { error: String(e?.message||e).slice(0,500), latencyMs: Date.now() - start });
      await broadcastAgent(incidentId, "agent.failed", agentType);
      try {
        if (!(await repo.incidents.getById(incidentId))) return null;
        const row = await repo.findings.create({ id: randomUUID(), incidentId, agentType, summary: `${agentType} failed: ${String(e?.message||e).slice(0,120)}`, confidence: 0.3, supportingEvidence: [], contradictoryEvidence: [String(e?.message||e)], informationNeeded: ["retry or human review"], mossEvidenceIds: [], contextVersion: version, dependsOn: [], status: "active", mossLatencyMs: null, raw: { error: String(e?.message||e) } });
        await broadcastEvent(incidentId, { type: "finding.created", eventId: randomUUID(), incidentId, timestamp: new Date().toISOString(), payload: { finding: serializeDates(row) } }).catch((err)=>{ console.warn(JSON.stringify({ route:"pipeline", event:"broadcast fallback finding failed", incidentId, agentType, error:String(err?.message||err)})); });
      } catch (err:any) { console.warn(JSON.stringify({ route:"pipeline", event:"fallback finding failed", incidentId, agentType, error:String(err?.message||err)})); }
      return null;
    } finally {
      await tryStartEvidence(incidentId).catch((err)=>{ console.warn(JSON.stringify({ route:"pipeline", event:"tryStartEvidence failed", incidentId, error:String(err?.message||err)})); });
    }
  };

  await Promise.allSettled([
    runBranch("historical", () => runHistoricalAgent(serializeDates(incident), serializeDates(detection), version)),
    runBranch("investigation", () => runInvestigationAgent(serializeDates(incident), serializeDates(detection), null, version)),
  ]);
  await tryStartEvidence(incidentId).catch((err)=>{ console.warn(JSON.stringify({ route:"pipeline", event:"final tryStartEvidence failed", incidentId, error:String(err?.message||err)})); });
}
