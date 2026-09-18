import { searchMoss } from "../moss/client";
import { synthesize } from "../llm/provider";

// Evidence assessment thresholds — extracted from prior magic values, semantics preserved
const HIGH_CONFIDENCE_THRESHOLD = 0.8; // detection.confidence above this is considered strong
const HISTORICAL_CONFIDENCE_THRESHOLD = 0.6; // historical finding confidence considered supportive
const INVESTIGATION_LOW_CONFIDENCE_THRESHOLD = 0.65; // below this triggers disagreement when historical support exists
const COMPLETENESS_WITH_STRONG_SUPPORT = 58; // completeness when strong historical + high detection
const COMPLETENESS_WITH_LIMITED_SUPPORT = 74; // completeness otherwise (partial)

export async function runEvidenceAgent(incident:any, detection:any, findings:any[], contextVersion:number): Promise<any>{
  const query = `evidence completeness contradiction information gaps oil spill assessment`;
  const { results, metrics } = await searchMoss(query, "evidence_assessment");
  let llmJson:any=null; let llmLatency=0;
  const system = `You are Evidence/Assessment Agent. Check completeness, contradictions, stale findings, unsupported claims, missing info, disagreement. Output JSON: {completeness (0-100), summary, gaps: string[], disagreement: boolean, disagreementReason, recommendation, dependsOn: string[]}`;
  const user = `Incident: ${JSON.stringify(incident)}\nDetection: ${JSON.stringify(detection)}\nFindings: ${JSON.stringify(findings.map(f=>({ agent:f.agentType, summary:f.summary, confidence:f.confidence })))}\nMoss: ${JSON.stringify(results)}\nContext v${contextVersion}`;
  const llm = await synthesize({ system, user });
  llmLatency = llm.latencyMs;
  if(llm.json?.completeness !== undefined) llmJson = llm.json;
  if(!llmJson){
    const hasHist = findings.some((f:any)=>f.agentType==="historical" && f.confidence>HISTORICAL_CONFIDENCE_THRESHOLD);
    const invConf = findings.find((f:any)=>f.agentType==="investigation")?.confidence || 0.5;
    const completeness = hasHist && detection.confidence>HIGH_CONFIDENCE_THRESHOLD ? COMPLETENESS_WITH_STRONG_SUPPORT : COMPLETENESS_WITH_LIMITED_SUPPORT;
    const disagreement = hasHist && invConf < INVESTIGATION_LOW_CONFIDENCE_THRESHOLD;
    llmJson = {
      completeness,
      summary: disagreement ? "FACT: Historical similarity exists but current evidence alone is insufficient. INFERENCE: Disagreement between Historical (moderate concern) and Investigation (low confidence) is expected with single image. UNKNOWN: wind/current/second image." : "Evidence partially complete, awaiting environmental corroboration.",
      gaps: ["wind direction/speed","current direction","second temporal observation","AIS vessel proximity"],
      disagreement,
      disagreementReason: disagreement ? "Historical similarity exists, but current imagery alone does not sufficiently confirm the anomaly. KB-002 requires temporal confirmation." : "",
      recommendation: "Human review required. Add wind/current observation or second image before escalation.",
      dependsOn: ["wind/current","temporal_confirmation"]
    };
  }
  return {
    id: `finding-evd-${Date.now()}`,
    incidentId: incident.id,
    agentType: "evidence",
    summary: llmJson.summary,
    confidence: (llmJson.completeness||60)/100,
    supportingEvidence: [`Completeness: ${llmJson.completeness}%`],
    contradictoryEvidence: llmJson.disagreement ? [llmJson.disagreementReason] : [],
    informationNeeded: llmJson.gaps||[],
    mossEvidenceIds: metrics.resultIds,
    contextVersion,
    dependsOn: llmJson.dependsOn||[],
    status: "active",
    mossLatencyMs: metrics.latencyMs,
    createdAt: new Date().toISOString(),
    raw: { ...llmJson, mossMetrics: metrics, llm: llm.text },
    mossMetrics: metrics,
    llmLatency,
    completeness: llmJson.completeness,
    disagreement: llmJson.disagreement,
    disagreementReason: llmJson.disagreementReason,
  };
}
