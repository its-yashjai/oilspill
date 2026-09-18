"use client";
import { motion } from "framer-motion";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { evidenceText } from "@/lib/utils";

const agentColors: Record<string, string> = {
  historical: "text-emerald-400",
  investigation: "text-sky-400",
  evidence: "text-amber-400",
};

const agentIcons: Record<string, string> = {
  historical: "📜",
  investigation: "🔬",
  evidence: "⚖️",
};

export function FindingsPanel({ 
  findings, 
  contextVersion,
  incidentId,
  onReassess
}: { 
  findings: any[];
  contextVersion: number;
  incidentId: string;
  onReassess?: (findingId: string) => void;
}) {
  const activeFindings = findings.filter(f => f.status === "active");
  const staleFindings = findings.filter(f => f.status === "stale");

  const getAgentConfig = (type: string) => ({
    title: type.charAt(0).toUpperCase() + type.slice(1) + (type === "evidence" ? " / Assessment" : " Intelligence"),
    icon: agentIcons[type] || "📄",
    color: agentColors[type] || "text-slate-400",
  });

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <span className="text-xs font-semibold tracking-widest text-slate-400">AGENT FINDINGS</span>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{findings.length} findings</Badge>
          {staleFindings.length > 0 && <Badge variant="warning" className="text-[10px]">{staleFindings.length} stale</Badge>}
          {staleFindings.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              className="px-2 py-1 text-[10px]"
              onClick={() => staleFindings.forEach(f => onReassess?.(f.id))}
              title="Rerun all stale findings"
            >
              ↻ Rerun Stale
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-4">
        {activeFindings.map((finding, i) => {
          const config = getAgentConfig(finding.agentType);
          return (
            <motion.div key={finding.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{config.icon}</span>
                  <span className={`text-sm font-semibold ${config.color}`}>{config.title}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant={finding.confidence > 0.7 ? "success" : finding.confidence > 0.5 ? "warning" : "outline"} className="text-[10px]">
                    {(finding.confidence * 100).toFixed(0)}%
                  </Badge>
                  <Badge variant="outline" className="text-[10px] text-slate-400">v{finding.contextVersion}</Badge>
                  {finding.status === "stale" && <Badge variant="warning" className="text-[10px]">STALE</Badge>}
                </div>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed mb-3">{finding.summary}</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 mb-3">
                <div>
                  <span className="font-medium text-slate-400">Moss Latency:</span>
                  <span className="font-mono text-cyan-400 ml-1">{finding.mossLatencyMs ?? "-"} ms</span>
                </div>
                <div>
                  <span className="font-medium text-slate-400">Evidence Refs:</span>
                  <span className="font-mono ml-1">{finding.mossEvidenceIds?.length ?? 0}</span>
                </div>
              </div>
              {(finding.supportingEvidence?.length || finding.contradictoryEvidence?.length || finding.informationNeeded?.length) && (
                <div className="space-y-1.5">
                  {finding.supportingEvidence?.map((e: unknown, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-[11px] text-emerald-300">
                      <span>✓</span> <span>{evidenceText(e)}</span>
                    </div>
                  ))}
                  {finding.contradictoryEvidence?.map((e: unknown, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-[11px] text-red-300">
                      <span>✗</span> <span>{evidenceText(e)}</span>
                    </div>
                  ))}
                  {finding.informationNeeded?.map((e: unknown, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-[11px] text-amber-300">
                      <span>?</span> <span>{evidenceText(e)}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}

        {staleFindings.length > 0 && (
          <div className="pt-2 border-t border-white/5 space-y-3">
            {staleFindings.map((finding, i) => {
              const config = getAgentConfig(finding.agentType);
              return (
                <motion.div key={finding.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{config.icon}</span>
                      <span className="text-sm font-semibold text-amber-300">{config.title} — STALE</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="warning" className="text-[10px]">STALE</Badge>
                      <Badge variant="outline" className="text-[10px] text-slate-400">Based on v{finding.contextVersion}</Badge>
                    </div>
                  </div>
                  <p className="text-sm text-slate-300 mb-3">This finding was based on context v{finding.contextVersion}. Current context is v{contextVersion}.</p>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => onReassess?.(finding.id)}
                      className="text-sm px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 transition-colors"
                    >
                      Reassess
                    </button>
                    <span className="text-[11px] text-slate-500">Reassessment will update to current context</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {activeFindings.length === 0 && staleFindings.length === 0 && (
          <div className="text-slate-500 text-sm text-center py-8">No findings yet — agents are working</div>
        )}
      </CardContent>
    </Card>
  );
}