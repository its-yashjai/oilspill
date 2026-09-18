"use client";
import { motion } from "framer-motion";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { evidenceText, formatUtcTime, formatUtcTimestamp } from "@/lib/utils";

const evidenceTypeColors: Record<string, string> = {
  LIVE: "text-emerald-400",
  DEMO: "text-sky-400",
  SATELLITE: "text-sky-400",
  TEMPORAL: "text-violet-400",
  HISTORICAL: "text-emerald-400",
  MOSS: "text-amber-400",
  USER_IMAGE: "text-cyan-400",
  HUMAN_OBSERVATION: "text-orange-400",
};

const evidenceTypeIcons: Record<string, string> = {
  LIVE: "🛰",
  DEMO: "🛰",
  SATELLITE: "🛰",
  TEMPORAL: "⏱",
  HISTORICAL: "📜",
  MOSS: "🔍",
  USER_IMAGE: "📤",
  HUMAN_OBSERVATION: "👤",
};

export function EvidencePanel({ 
  findings, 
  observations,
  images,
  detection,
  disagreements,
  gaps
}: { 
  findings: any[];
  observations: any[];
  images: any[];
  detection: any;
  disagreements: any[];
  gaps: any[];
}) {
  const isLive = images[0]?.sourceType === "LIVE" || detection?.raw?.mode==="LIVE";
  const isDemo = !isLive && (images[0]?.sourceType === "DEMO" || detection?.sourceImageId?.startsWith("DEMO"));
  const evidenceItems = [
    ...(detection ? [{
      id: `det-${detection.id || "1"}`,
      type: isLive ? "LIVE" : isDemo ? "DEMO" : "SATELLITE",
      title: isLive ? "LIVE Sentinel-1 SAR Detection" : isDemo ? "DEMO Simulated SAR Detection" : "SAR Anomaly Detection",
      source: isLive ? `LIVE ${detection.detectionMethod}` : isDemo ? "DEMO/SIMULATED SAR" : detection.detectionMethod || "Sentinel-1 SAR",
      timestamp: detection.timestamp,
      confidence: detection.confidence,
      metadata: detection,
    }] : []),
    ...images.map((img, i) => ({
      id: img.id || `img-${i}`,
      type: img.sourceType === "DEMO" ? "SATELLITE" : "USER_IMAGE" as const,
      title: img.sourceType === "DEMO" ? "Demo SAR Image" : "User Uploaded Image",
      source: img.sourceType,
      timestamp: img.createdAt,
      confidence: img.metadata?.confidence,
      metadata: img.metadata,
    })),
    ...(() => {
      const seen = new Set<string>();
      return findings.filter(f => f.mossEvidenceIds?.length).flatMap(f => 
        f.mossEvidenceIds.filter((mossId: string) => {
          if (seen.has(mossId)) return false;
          seen.add(mossId);
          return true;
        }).map((mossId: string) => ({
          id: `moss-${mossId}`,
          type: "MOSS" as const,
          title: "Moss Knowledge Retrieval",
          source: f.agentType,
          timestamp: f.createdAt,
          confidence: f.confidence,
          metadata: { mossId, agentType: f.agentType },
        }))
      );
    })(),
    ...observations.map(obs => ({
      id: obs.id,
      type: "HUMAN_OBSERVATION" as const,
      title: "Human Observation",
      source: obs.author,
      timestamp: obs.createdAt,
      confidence: undefined,
      metadata: { text: obs.text },
    })),
    ...findings.filter(f => f.agentType === "historical").flatMap(f =>
      f.supportingEvidence.map((e: string, i: number) => ({
        id: `hist-${f.id}-${i}`,
        type: "HISTORICAL" as const,
        title: "Historical Record",
        source: f.agentType,
        timestamp: f.createdAt,
        confidence: f.confidence,
        metadata: { evidence: e },
      }))
    ),
  ];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <span className="text-xs font-semibold tracking-widest text-slate-400">EVIDENCE & FINDINGS</span>
        <Badge variant="outline" className="text-[10px]">{evidenceItems.length} items</Badge>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-3">
        <div className="space-y-2">
          {evidenceItems.map((item, i) => {
            const icon = evidenceTypeIcons[item.type] || "📄";
            const color = evidenceTypeColors[item.type] || "text-slate-400";
            return (
              <motion.div key={item.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{item.title}</span>
                        <Badge variant="outline" className={`${color} text-[10px]`}>{item.type}</Badge>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>Source: {item.source}</span>
                        <span>·</span>
                        <span>{formatUtcTimestamp(item.timestamp)}</span>
                        {item.confidence !== undefined && (
                          <>
                            <span>·</span>
                            <span className="font-mono text-cyan-400">Confidence: {(item.confidence * 100).toFixed(0)}%</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0">{item.id.slice(0, 20)}</span>
                </div>
                {item.metadata?.text && (
                  <div className="mt-2 text-sm text-slate-300 italic">“{item.metadata.text}”</div>
                )}
                {item.metadata?.evidence && (
                  <div className="mt-2 text-sm text-slate-300">{evidenceText(item.metadata.evidence)}</div>
                )}
              </motion.div>
            );
          })}
        </div>

        {disagreements.length > 0 && (
          <div className="pt-4 border-t border-white/5">
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
              <div className="flex items-center gap-2 text-red-300 text-sm font-medium mb-2">
                <span>⚠</span> AGENT DISAGREEMENT
              </div>
              {disagreements.map((d, i) => (
                <div key={d.id} className="text-sm text-slate-300">
                  <div className="font-medium text-orange-300">Reason: {d.reason}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Context v{d.contextVersion} · {formatUtcTime(d.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(gaps[0]?.gaps?.length ?? 0) > 0 && (
          <div className="pt-4 border-t border-white/5">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
              <div className="flex items-center gap-2 text-amber-300 text-sm font-medium mb-2">
                <span>📋</span> INFORMATION GAPS
              </div>
              <div className="space-y-1">
                {gaps[0].gaps.map((gap: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" className="w-4 h-4 accent-amber-500" />
                    <span>{gap}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {evidenceItems.length === 0 && gaps[0]?.gaps?.length === 0 && disagreements.length === 0 && (
          <div className="text-slate-500 text-sm text-center py-8">No evidence yet</div>
        )}
      </CardContent>
    </Card>
  );
}