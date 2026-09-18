"use client";
import { motion } from "framer-motion";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentStatus } from "@/lib/agents/types";
import { agentStatusMap as statusMap, dotColorFromStatus } from "@/lib/agents/statusMap";

async function rerunAgent(incidentId: string, agentType: "historical" | "investigation" | "evidence") {
  const res = await fetch(`/api/incidents/${incidentId}/rerun`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to rerun agent" }));
    throw new Error(err.error || "Failed to rerun agent");
  }
}

async function rerunAllAgents(incidentId: string) {
  const res = await fetch(`/api/incidents/${incidentId}/rerun`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentType: "all" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to rerun all agents" }));
    throw new Error(err.error || "Failed to rerun all agents");
  }
}

export function CollaborativeAIPanel({ 
  findings, 
  mossMetrics,
  contextVersion,
  participants = [],
  agents = [],
  incidentId
}: { 
  findings: any[];
  mossMetrics?: { totalLatencyMs?: number; queryCount?: number; resultCount?: number };
  contextVersion: number;
  participants?: Array<{ identity: string; name: string; isAgent?: boolean }>;
  agents?: Array<{ id: string; name: string; status: AgentStatus; latency?: number; mossLatency?: number }>;
  incidentId: string;
}) {
  const agentData = agents.length > 0 ? agents : [
    { 
      id: "historical", 
      name: "Historical Intelligence Agent",
      status: findings.find(f => f.agentType === "historical" && f.status === "active") ? "completed" : 
              findings.some(f => f.agentType === "historical" && f.status === "stale") ? "reassessing" : "searching",
      mossLatency: findings.find(f => f.agentType === "historical")?.mossLatencyMs 
    },
    { 
      id: "investigation", 
      name: "Investigation Agent",
      status: findings.find(f => f.agentType === "investigation" && f.status === "active") ? "completed" : 
              findings.some(f => f.agentType === "investigation" && f.status === "stale") ? "reassessing" : "analyzing"
    },
    { 
      id: "evidence", 
      name: "Evidence / Assessment Agent",
      status: findings.find(f => f.agentType === "evidence" && f.status === "active") ? "completed" : 
              findings.some(f => f.agentType === "evidence" && f.status === "stale") ? "reassessing" : 
              findings.length >= 2 ? "analyzing" : "waiting"
    },
  ];

  if (findings.length === 0) {
    agentData.forEach(a => {
      if (a.id === "historical") a.status = "searching";
      if (a.id === "investigation") a.status = "analyzing";
      if (a.id === "evidence") a.status = "waiting";
    });
  }

  return (
    <div className="space-y-4">
      <Card className="h-[320px] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <span className="text-xs font-semibold tracking-widest text-slate-400">AGENT PRESENCE</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{agentData.filter(a => ["searching","analyzing","reassessing"].includes(a.status)).length} active</Badge>
            <Button 
              variant="outline" 
              size="sm" 
              className="px-2 py-1 text-[10px]"
              onClick={() => rerunAllAgents(incidentId)}
              title="Rerun all agents"
            >
              ↻ Rerun All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-3">
          {agentData.map((a, i) => {
            const s = statusMap[a.status as AgentStatus];
            return (
              <motion.div key={a.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] p-3">
                <div>
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className={`text-xs ${s.color} flex items-center gap-1.5`}>
                    <span>{s.dot}</span> {s.label}
                    {a.mossLatency && a.id === "historical" && ` · Moss ${a.mossLatency} ms`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: dotColorFromStatus(a.status as AgentStatus) }} />
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="px-2 py-1 text-[10px]"
                    onClick={() => rerunAgent(incidentId, a.id as "historical" | "investigation" | "evidence")}
                    disabled={a.status === "running" || a.status === "searching" || a.status === "analyzing" || a.status === "reassessing"}
                    title={`Rerun ${a.name}`}
                  >
                    ↻
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="h-[200px] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <span className="text-xs font-semibold tracking-widest text-slate-400">LIVE ACTIVITY</span>
          <Badge variant="outline" className="text-[10px]">LIVE</Badge>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-1 text-xs font-mono">
          <div className="text-slate-500">Context v{contextVersion}</div>
          {agentData.map(a => {
            const s = statusMap[a.status as AgentStatus];
            return (
              <div key={a.id} className={`flex items-center gap-1.5 ${s.color}`}>
                <span>{s.dot}</span>
                <span>{a.name.split(" ")[0]}: {s.label}</span>
              </div>
            );
          })}
          {mossMetrics && (
            <div className="text-violet-400 mt-2">
              <span>Moss: {mossMetrics.resultCount ?? 0} results · {mossMetrics.totalLatencyMs ?? 0} ms · {mossMetrics.queryCount ?? 1} queries</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}