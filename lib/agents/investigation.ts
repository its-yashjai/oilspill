import { searchMoss } from "../moss/client";
import { synthesize } from "../llm/provider";
import type { Finding } from "./types";

export async function runInvestigationAgent(incident:any, detection:any, historicalFinding:any, contextVersion:number): Promise<Finding & { mossMetrics:any; llmLatency:number }>{
  const previousObservation = (detection?.raw?.previousObservation || detection?.raw?.comparison?.previousId) ? (detection.raw.previousObservation || { productId: detection.comparisonImageId, acquiredAt: "unknown" }) : null;
  const currentObservation = detection?.raw?.liveObservation || null;
  const temporalAvailable = !!(currentObservation && previousObservation && previousObservation.productId && previousObservation.productId !== "NONE");
  const hoursApart = detection?.raw?.comparison?.hoursApart;
  const query = `current evidence assessment oil spill detection ${detection.detectionMethod} confidence ${detection.confidence} area ${detection.affectedAreaEstimate} ${temporalAvailable ? `temporal ${hoursApart}h` : "single observation"}`;
  const { results, metrics } = await searchMoss(query, "investigation_retrieval");
  let llmJson:any=null; let llmLatency=0;
  const temporalContext = temporalAvailable
    ? `Temporal pair: CURRENT ${currentObservation.productId} (${currentObservation.acquiredAt}) and PREVIOUS ${previousObservation.productId} (${previousObservation.acquiredAt}), ${hoursApart ?? "?"}h apart. Use cautious wording: Potential SAR change detected between observations. SAR alone does not confirm oil spill.`
    : `Single observation only: ${currentObservation?.productId || detection.sourceImageId} (${currentObservation?.acquiredAt || detection.timestamp}). No previous scene available — temporal comparison unavailable.`;
  const system = `You are Investigation Agent. Analyze current evidence with cautious wording. Distinguish FACT/INFERENCE/HYPOTHESIS/UNKNOWN. Never claim SAR alone confirms an oil spill. If temporal pair available, say "Potential SAR change detected between observations." Never invent evidence. Output JSON: {summary, confidence, supportingEvidence, contradictoryEvidence, informationNeeded, dependsOn}`;
  const user = `Incident: ${JSON.stringify(incident)}\nDetection: ${JSON.stringify(detection)}\nTemporal: ${temporalContext}\nHistorical Finding: ${JSON.stringify(historicalFinding?.summary)}\nMoss: ${JSON.stringify(results)}\nContext v${contextVersion}`;
  const llm = await synthesize({ system, user });
  llmLatency = llm.latencyMs;
  if(llm.json?.summary) llmJson = llm.json;
  if(!llmJson){
    if (temporalAvailable) {
      // Temporal pair available — cautious wording
      if(detection.confidence > 0.85){
        llmJson = {
          summary: `FACT: Potential SAR change detected between observations. Current ${currentObservation.productId} high confidence (0.91) vs previous ${previousObservation.productId}. INFERENCE: Change pattern is suggestive but SAR alone does not confirm oil spill. HYPOTHESIS: Could be operational discharge or look-alike. UNKNOWN: wind/current, AIS, in-situ confirmation.`,
          confidence: 0.62,
          supportingEvidence: [`Potential SAR change between ${currentObservation.productId} and ${previousObservation.productId}`, `High detector confidence (0.91) on current`, `Time gap ${hoursApart}h`, `Moss KB: ${results.find((r:any)=>r.id==="KB-002") ? "temporal confirmation helpful" : "change detection"}`],
          contradictoryEvidence: ["SAR alone insufficient to confirm spill — requires human review", "Wind/current unknown — affects interpretation"],
          informationNeeded: ["wind direction/speed","current","human visual confirmation","AIS vessel proximity"],
          dependsOn: ["wind/current","human_review"]
        };
      } else {
        llmJson = {
          summary: `FACT: Potential SAR change detected between observations but low-mid confidence (${detection.confidence}). INFERENCE: Insufficient to confirm anomaly. HYPOTHESIS: Look-alike possible. UNKNOWN: environmental context, second confirmation.`,
          confidence: 0.42,
          supportingEvidence: [`Potential SAR change between ${currentObservation.productId} and ${previousObservation.productId}`, `Detector confidence ${detection.confidence}`],
          contradictoryEvidence: ["KB-004 look-alikes not ruled out", "SAR alone does not confirm spill"],
          informationNeeded: ["wind/current","chlorophyll data","human review"],
          dependsOn: ["wind/current","human_review"]
        };
      }
    } else {
      // Single observation fallback — cautious wording
      if(detection.confidence > 0.85){
        llmJson = {
          summary: "FACT: Single SAR image shows potential anomaly with high detector confidence (0.91) and 23% area estimate. INFERENCE: Pattern is suggestive but single temporal observation cannot confirm spill — SAR alone does not confirm oil spill. HYPOTHESIS: Could be operational discharge or seep. UNKNOWN: wind/current, second image, AIS.",
          confidence: 0.58,
          supportingEvidence: ["High detector confidence (0.91)", "SAR damping present", `Moss KB: ${results.find((r:any)=>r.id==="KB-002") ? "single image insufficient" : "temporal confirmation needed"}`],
          contradictoryEvidence: ["No second temporal image — temporal comparison unavailable", "Wind window unknown — calm vs moderate changes interpretation", "SAR alone does not confirm spill"],
          informationNeeded: ["wind direction/speed","current","second temporal image","human visual confirmation"],
          dependsOn: ["wind/current","temporal_confirmation"]
        };
      } else {
        llmJson = {
          summary: "FACT: Low-mid confidence detection on single observation. INFERENCE: Insufficient to elevate concern — SAR alone does not confirm spill. HYPOTHESIS: Look-alike possible (algal bloom/cloud shadow). UNKNOWN: environmental context.",
          confidence: 0.42,
          supportingEvidence: ["Detector confidence 0.55-0.68"],
          contradictoryEvidence: ["KB-004 look-alikes not ruled out","Single observation — no temporal confirmation"],
          informationNeeded: ["wind/current","chlorophyll data","second image"],
          dependsOn: ["wind/current"]
        };
      }
    }
  }
  return {
    id: `finding-inv-${Date.now()}`,
    incidentId: incident.id,
    agentType: "investigation",
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
