import type { DetectionResult } from "./types";
import { DEMO_IMAGES } from "./demo-images";

export async function runDetection(opts:{
  sourceImageId: string;
  buffer?: Buffer;
  fileName?: string;
  regionHint?: string;
  mode?: "DEMO" | "LIVE";
}): Promise<DetectionResult>{
  const t0 = performance.now();
  // deterministic demo detector
  // if buffer provided, use heuristic based on filename/size; else use demo mapping
  let anomalyDetected = true;
  let confidence = 0.91;
  let affectedAreaEstimate = 23;
  let location = { lat: 19.2, lon: 64.5, label: "Arabian Sea · Off Mumbai" };
  let detectionMethod = "demo-threshold-segmentation + temporal-difference";
  let comparisonImageId = "DEMO-SAR-000";

  // DEMO behavior is explicitly gated on mode === "DEMO" (or undefined for backwards-compat DEMO) — LIVE never uses DEMO mapping even if ID collides
  const isDemoMode = opts.mode !== "LIVE";
  const demo = isDemoMode ? DEMO_IMAGES.find(d=>d.id===opts.sourceImageId) : undefined;
  if(demo){
    confidence = demo.expectedConfidence;
    affectedAreaEstimate = demo.affectedArea;
    location = demo.location;
    comparisonImageId = demo.comparisonId;
    anomalyDetected = demo.expectedAnomaly;
  } else if(opts.buffer){
    // heuristic for user upload: larger buffer -> slightly higher confidence
    const size = opts.buffer.length;
    const name = (opts.fileName||"").toLowerCase();
    const darkHint = name.includes("dark") || name.includes("oil") || name.includes("sar");
    if(size < 5000) { confidence = 0.42; affectedAreaEstimate= 5; anomalyDetected=false; detectionMethod += " (low-res fallback)"; }
    else if(darkHint) { confidence = 0.78; affectedAreaEstimate= 18; anomalyDetected=true; }
    else { confidence = 0.55; affectedAreaEstimate= 8; anomalyDetected=true; }
    // add tiny deterministic jitter based on size
    confidence = Math.min(0.95, Math.max(0.3, confidence + (size % 7)*0.01));
  }
  // simulate processing latency 120-250ms but measure real
  await new Promise(r=>setTimeout(r, 120 + Math.floor(Math.random()*60)));
  const processingLatencyMs = Math.round(performance.now()-t0);
  return {
    anomalyDetected,
    confidence: Number(confidence.toFixed(2)),
    affectedAreaEstimate,
    location,
    detectionMethod,
    sourceImageId: opts.sourceImageId,
    comparisonImageId,
    timestamp: new Date().toISOString(),
    processingLatencyMs,
    raw: { note: "Potential oil-like anomaly — not confirmed. Requires human review." }
  };
}
