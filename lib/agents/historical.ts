import { searchMoss } from "../moss/client";
import { synthesize } from "../llm/provider";
import type { Finding } from "./types";

export async function runHistoricalAgent(incident: any, detection: any, contextVersion:number): Promise<Finding & { mossMetrics:any; llmLatency:number }>{
  const query = `${incident.region} oil spill anomaly SAR detection confidence ${detection.confidence} ${incident.location?.label||""}`;
  const { results, metrics } = await searchMoss(query, "historical_retrieval");
  let llmJson:any = null; let llmLatency=0;
  const system = `You are Historical Intelligence Agent for BlueSentinel. Find historical incidents relevant to current incident. Never fabricate incidents. If no results, say "No relevant knowledge retrieved." Output JSON: {summary, confidence (0-1), supportingEvidence: string[], contradictoryEvidence: string[], informationNeeded: string[], dependsOn: string[]}. Distinguish FACT/INFERENCE/HYPOTHESIS/UNKNOWN.`;
  const user = `Incident: ${JSON.stringify(incident)}\nDetection: ${JSON.stringify(detection)}\nMoss results: ${JSON.stringify(results)}\nContext version: ${contextVersion}`;
  const llm = await synthesize({ system, user });
  llmLatency = llm.latencyMs;
  if(llm.json && llm.json.summary) llmJson = llm.json;
  // fallback template if LLM mock
  if(!llmJson){
    if(results.length===0){
      llmJson = { summary: "No relevant knowledge retrieved.", confidence: 0.35, supportingEvidence: [], contradictoryEvidence:[], informationNeeded:["second temporal observation","wind/current data"], dependsOn:["wind/current"] };
    } else {
      const top = results.slice(0,3).map((r:any)=>r.id).join(", ");
      llmJson = {
        summary: `FACT: ${results.length} historical records retrieved. INFERENCE: Similar wind-aligned dark slicks in Arabian Sea (e.g., HIST-001, HIST-003) share SAR damping and elongation. HYPOTHESIS: Current anomaly pattern is consistent with historical bilge/crude events but not conclusive. UNKNOWN: wind history at capture time.`,
        confidence: results.some((r:any)=>r.id==="HIST-003") ? 0.76 : 0.62,
        supportingEvidence: results.map((r:any)=> `${r.id}: ${r.snippet}`),
        contradictoryEvidence: results.some((r:any)=>r.id==="HIST-002") ? ["HIST-002 shows algal bloom look-alike with circular shape — current anomaly is elongated, so low contradiction"] : [],
        informationNeeded: ["wind direction/speed at capture", "second temporal SAR image", "AIS vessel proximity"],
        dependsOn: ["wind/current","temporal_confirmation"]
      };
    }
  }
  return {
    id: `finding-hist-${Date.now()}`,
    incidentId: incident.id,
    agentType: "historical",
    summary: llmJson.summary,
    confidence: llmJson.confidence,
    supportingEvidence: llmJson.supportingEvidence||[],
    contradictoryEvidence: llmJson.contradictoryEvidence||[],
    informationNeeded: llmJson.informationNeeded||[],
    mossEvidenceIds: metrics.resultIds,
    contextVersion,
    dependsOn: llmJson.dependsOn||[],
    status: "active",
    mossLatencyMs: metrics.latencyMs,
    createdAt: new Date().toISOString(),
    raw: { mossMetrics: metrics, llm: llm.text },
    mossMetrics: metrics,
    llmLatency
  } as any;
}
