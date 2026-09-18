"use client";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import type { AgentStatus } from "@/lib/agents/types";
import { agentStatusMap as statusMap, dotColorFromStatus } from "@/lib/agents/statusMap";

export function AgentPanel({ findings, timeline }: { findings:any[]; timeline:any[] }){
  const agents: { id:string; name:string; status:AgentStatus; latency?:number; moss?:number }[] = [
    { id:"historical", name:"Historical Agent", status: findings.find(f=>f.agentType==="historical" && (f.status||"")==="active") ? "completed" : findings.some(f=>f.agentType==="historical" && (f.status||"")==="stale") ? "reassessing" : "searching", latency: findings.find(f=>f.agentType==="historical")?.mossLatencyMs, moss: findings.find(f=>f.agentType==="historical")?.mossLatencyMs },
    { id:"investigation", name:"Investigation Agent", status: findings.find(f=>f.agentType==="investigation" && (f.status||"")==="active") ? "completed" : findings.some(f=>f.agentType==="investigation" && (f.status||"")==="stale") ? "reassessing" : "analyzing" },
    { id:"evidence", name:"Evidence Agent", status: findings.find(f=>f.agentType==="evidence" && (f.status||"")==="active") ? "completed" : findings.some(f=>f.agentType==="evidence" && (f.status||"")==="stale") ? "reassessing" : findings.length>=2 ? "analyzing" : "waiting" },
  ];
  // if no findings yet, set searching
  if(findings.length===0) agents.forEach(a=> { if(a.id==="historical") a.status="searching"; if(a.id==="investigation") a.status="analyzing"; if(a.id==="evidence") a.status="waiting"; });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <span className="text-xs font-semibold tracking-widest text-slate-400">AGENT COLLABORATION</span>
        <Badge variant="outline" className="text-[10px]">{findings.filter(f=>f.status==="active").length} active</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {agents.map(a=>{
          const s = statusMap[a.status];
          return (
            <motion.div key={a.id} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] p-3">
              <div>
                <div className="text-sm font-medium">{a.name}</div>
                <div className={`text-xs ${s.color} flex items-center gap-1.5`}><span>{s.dot}</span> {s.label} {a.id==="historical" && a.moss ? `· Moss ${a.moss} ms` : ""}</div>
              </div>
              <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: dotColorFromStatus(a.status)} } />
            </motion.div>
          );
        })}
        <div className="pt-2 space-y-2">
          {findings.filter(f=>f.status==="active").slice(0,3).map(f=> (
            <div key={f.id} className="rounded-lg bg-slate-800/50 border border-white/5 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-cyan-300 uppercase">{f.agentType}</span>
                <Badge variant={f.confidence>0.7?"success":f.confidence>0.5?"warning":"outline"} className="text-[10px]">{Math.round(f.confidence*100)}%</Badge>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed line-clamp-4">{f.summary}</p>
              <div className="text-[10px] text-slate-500 mt-1">v{f.contextVersion} · {f.status} · Moss {f.mossLatencyMs ?? "-"} ms</div>
            </div>
          ))}
          {findings.filter(f=>f.status==="stale").length>0 && (
            <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded p-2">
              {findings.filter(f=>f.status==="stale").length} stale finding(s) — reassessment triggered after human observation.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}