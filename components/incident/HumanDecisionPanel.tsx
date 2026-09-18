"use client";
import { motion } from "framer-motion";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatUtcTimestamp } from "@/lib/utils";

interface HumanDecisionPanelProps {
  incidentId: string;
  incident: any;
  findings: any[];
  onDecision: (action: string, reasoning: string) => Promise<void>;
}

const decisionOptions = [
  { 
    action: "mark_low_concern", 
    label: "Low Concern", 
    variant: "ghost" as const,
    icon: "✅",
    desc: "Evidence does not support oil spill concern"
  },
  { 
    action: "request_more_evidence", 
    label: "Request More Evidence", 
    variant: "outline" as const,
    icon: "📋",
    desc: "Need additional temporal/environmental data"
  },
  { 
    action: "escalate", 
    label: "Escalate", 
    variant: "destructive" as const,
    icon: "🚨",
    desc: "Evidence warrants immediate escalation"
  },
];

export function HumanDecisionPanel({ incidentId, incident, findings, onDecision }: HumanDecisionPanelProps) {
  const activeFindings = findings.filter(f => f.status === "active");
  const evidenceFindings = findings.find(f => f.agentType === "evidence");
  const completeness = evidenceFindings?.raw?.completeness || 74;
  
  const avgConfidence = activeFindings.length > 0
    ? activeFindings.reduce((sum, f) => sum + f.confidence, 0) / activeFindings.length
    : 0;

  const hasDisagreement = findings.some(f => f.raw?.disagreement === true);
  const gapCount = findings.find(f => f.agentType === "evidence")?.informationNeeded?.length || 0;

  let consensus = "Insufficient data";
  if (hasDisagreement) consensus = "Moderate concern (disagreement)";
  else if (avgConfidence > 0.7) consensus = "High concern";
  else if (avgConfidence > 0.5) consensus = "Moderate concern";
  else consensus = "Low concern";

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <span className="text-xs font-semibold tracking-widest text-slate-400">HUMAN DECISION</span>
        <Badge variant={incident.status === "escalated" ? "danger" : incident.status === "resolved" ? "success" : "outline"} className="text-[10px]">
          {incident.status?.toUpperCase() || "INVESTIGATING"}
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-4">
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
          <div className="text-xs font-semibold tracking-widest text-slate-400 mb-3">CURRENT ASSESSMENT</div>
          <p className="text-lg font-semibold text-cyan-300 mb-4">Potential oil-like anomaly</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-[11px] text-slate-400">Evidence Confidence</div>
              <div className="text-2xl font-bold text-cyan-400">{(avgConfidence * 100).toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Evidence Completeness</div>
              <div className="text-2xl font-bold text-amber-400">{completeness}%</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Information Gaps</div>
              <div className="text-2xl font-bold text-red-400">{gapCount}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Agent Consensus</div>
              <div className="text-sm font-medium text-sky-300">{consensus}</div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {decisionOptions.map(opt => (
            <Button
              key={opt.action}
              variant={opt.variant}
              size="lg"
              className="w-full justify-start gap-3 text-left"
              onClick={() => onDecision(opt.action, `Human decision: ${opt.label}`)}
            >
              <span className="text-xl">{opt.icon}</span>
              <div>
                <div className="font-medium">{opt.label}</div>
                <div className="text-[11px] text-slate-500">{opt.desc}</div>
              </div>
            </Button>
          ))}
        </div>

        <div className="pt-4 border-t border-white/5">
          <div className="text-xs font-semibold tracking-widest text-slate-400 mb-2">DECISION HISTORY</div>
          {incident.decisions?.length > 0 ? (
            <div className="space-y-2">
              {incident.decisions.slice().reverse().map((d: any, i: number) => (
                <motion.div key={d.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Badge variant={d.action === "escalate" ? "danger" : d.action === "mark_low_concern" ? "success" : "outline"} className="text-[10px]">
                      {d.action.toUpperCase().replace("_", " ")}
                    </Badge>
                    <span className="text-[10px] text-slate-500 font-mono">v{d.contextVersion}</span>
                  </div>
                  <div className="text-sm text-slate-300">{d.reasoning || "No reasoning provided"}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{formatUtcTimestamp(d.createdAt)}</div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-slate-500 text-sm text-center py-4">No decisions recorded</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}