"use client";
import { motion } from "framer-motion";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUtcTime } from "@/lib/utils";

const typeColors: Record<string, string> = {
  incident_created: "text-sky-400",
  detection_completed: "text-cyan-400",
  finding_created: "text-emerald-400",
  moss_query_completed: "text-violet-400",
  human_observation_added: "text-amber-400",
  reassessment_started: "text-orange-400",
  disagreement_detected: "text-red-400",
  context_updated: "text-slate-400",
  finding_stale: "text-amber-400",
  human_approval: "text-emerald-400",
  agent_error: "text-red-400",
};

const typeLabels: Record<string, string> = {
  incident_created: "Incident Created",
  detection_completed: "Detection Completed",
  finding_created: "Finding Created",
  moss_query_completed: "Moss Query Completed",
  human_observation_added: "Human Observation",
  reassessment_started: "Reassessment Started",
  disagreement_detected: "Disagreement Detected",
  context_updated: "Context Updated",
  finding_stale: "Finding Marked Stale",
  human_approval: "Human Decision",
  agent_error: "Agent Error",
};

export function TimelinePanel({ timeline }: { timeline: any[] }) {
  const sorted = [...timeline].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <span className="text-xs font-semibold tracking-widest text-slate-400">INCIDENT TIMELINE</span>
        <Badge variant="outline" className="text-[10px]">{sorted.length} events</Badge>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-2">
        {sorted.map((event, i) => {
          const time = formatUtcTime(event.createdAt);
          const color = typeColors[event.type] || "text-slate-400";
          const label = typeLabels[event.type] || event.type;
          return (
            <motion.div key={event.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex gap-2 text-xs">
              <span className="text-slate-500 font-mono w-20 shrink-0">{time}</span>
              <span className={`${color} font-medium`}>{label}</span>
              <span className="text-slate-500 flex-1 truncate">
                {event.payload?.observation?.text 
                  ? `“${event.payload.observation.text.slice(0, 80)}”`
                  : event.payload?.finding 
                  ? `${event.payload.finding.agentType}: ${event.payload.finding.summary?.slice(0, 60)}…`
                  : event.payload?.detection 
                  ? `confidence ${(event.payload.detection.confidence * 100).toFixed(0)}%`
                  : event.payload?.reason 
                  ? event.payload.reason.slice(0, 80)
                  : event.payload?.version 
                  ? `v${event.payload.version}`
                  : JSON.stringify(event.payload).slice(0, 80)}
              </span>
            </motion.div>
          );
        })}
        {sorted.length === 0 && <div className="text-slate-500 text-sm text-center py-8">No timeline events yet</div>}
      </CardContent>
    </Card>
  );
}