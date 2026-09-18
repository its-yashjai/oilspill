"use client";
import { motion } from "framer-motion";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUtcTime } from "@/lib/utils";

interface ContextVersionPanelProps {
  contextVersions: any[];
  currentVersion: number;
}

const versionLabels: Record<number, string> = {
  1: "Incident created",
  2: "Detection added",
  3: "Historical evidence added",
  4: "Investigation finding added",
  5: "Human observation added",
  6: "Reassessment completed",
};

export function ContextVersionPanel({ contextVersions, currentVersion }: ContextVersionPanelProps) {
  const sorted = [...contextVersions].sort((a, b) => a.version - b.version);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <span className="text-xs font-semibold tracking-widest text-slate-400">SHARED CONTEXT</span>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
            v{currentVersion}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-2">
        {sorted.map((ctx, i) => (
          <motion.div key={ctx.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="flex items-start gap-2 p-3 rounded-lg border border-white/5 bg-white/[0.02]">
            <div className="flex items-center justify-center w-8 h-8 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 font-mono text-xs shrink-0">
              v{ctx.version}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-200">
                {versionLabels[ctx.version] || `Context updated (${JSON.stringify(ctx.snapshot).slice(0, 50)}…)`}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">{formatUtcTime(ctx.createdAt)}</div>
            </div>
          </motion.div>
        ))}
        {sorted.length === 0 && <div className="text-slate-500 text-sm text-center py-8">No context versions yet</div>}
      </CardContent>
    </Card>
  );
}