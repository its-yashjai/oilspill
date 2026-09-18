"use client";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MossPanelProps {
  configured: boolean;
  findings: any[];
  mossMetrics?: { totalLatencyMs?: number; queryCount?: number; resultCount?: number; mode?: string };
}

export function MossPanel({ findings, mossMetrics, configured }: MossPanelProps) {
  const historicalFinding = findings.find(f => f.agentType === "historical" && f.status === "active") || findings.find(f => f.agentType === "historical");
  const investigationFinding = findings.find(f => f.agentType === "investigation" && f.status === "active") || findings.find(f => f.agentType === "investigation");
  const evidenceFinding = findings.find(f => f.agentType === "evidence" && f.status === "active") || findings.find(f => f.agentType === "evidence");

  const totalMossLatency = mossMetrics?.totalLatencyMs 
    || (historicalFinding?.mossLatencyMs || 0) + (investigationFinding?.mossLatencyMs || 0) + (evidenceFinding?.mossLatencyMs || 0);
  const totalQueries = mossMetrics?.queryCount 
    || (historicalFinding?.mossEvidenceIds?.length || 0) + (investigationFinding?.mossEvidenceIds?.length || 0) + (evidenceFinding?.mossEvidenceIds?.length || 0);
  const totalResults = mossMetrics?.resultCount 
    || (historicalFinding?.mossEvidenceIds?.length || 0) + (investigationFinding?.mossEvidenceIds?.length || 0) + (evidenceFinding?.mossEvidenceIds?.length || 0);

  const hasMossCreds = configured;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <span className="text-xs font-semibold tracking-widest text-slate-400">FAST KNOWLEDGE RETRIEVAL</span>
        <Badge variant={hasMossCreds ? "success" : "outline"} className="text-[10px]">
          {hasMossCreds ? "MOSS CONFIGURED" : "MOSS UNAVAILABLE"}
        </Badge>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="space-y-4">
          <div className="text-center py-2">
            <div className="text-3xl font-bold text-cyan-400 font-mono">{totalMossLatency.toFixed(1)} ms</div>
            <div className="text-xs text-slate-500">Total Moss Latency</div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="text-xl font-bold text-emerald-400 font-mono">{totalResults}</div>
              <div className="text-[10px] text-slate-500">Results</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="text-xl font-bold text-sky-400 font-mono">{totalQueries}</div>
              <div className="text-[10px] text-slate-500">Queries</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="text-xl font-bold text-amber-400 font-mono">{totalMossLatency.toFixed(1)}</div>
              <div className="text-[10px] text-slate-500">Avg ms/query</div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 space-y-2">
            <div className="text-xs font-semibold tracking-widest text-slate-400">Per-Agent Breakdown</div>
            {[
              { agent: "Historical", finding: historicalFinding },
              { agent: "Investigation", finding: investigationFinding },
              { agent: "Evidence", finding: evidenceFinding },
            ].map(({ agent, finding }) => (
              <div key={agent} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">{agent} Agent</span>
                <div className="flex items-center gap-3 text-right">
                  <span className="text-slate-400">{finding?.mossEvidenceIds?.length || 0} results</span>
                  <span className="font-mono text-cyan-400">{finding?.mossLatencyMs?.toFixed(1) || "-"} ms</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}