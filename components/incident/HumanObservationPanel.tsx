"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUtcTime } from "@/lib/utils";

interface HumanObservationPanelProps {
  incidentId: string;
  observations: any[];
  onAddObservation: (text: string) => Promise<void>;
}

export function HumanObservationPanel({ incidentId, observations, onAddObservation }: HumanObservationPanelProps) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || text.trim().length < 2) return;
    setIsSubmitting(true);
    try {
      await onAddObservation(text.trim());
      setText("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <span className="text-xs font-semibold tracking-widest text-slate-400">HUMAN OBSERVATIONS</span>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-3">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Add Observation</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Enter your observation (e.g., wind direction appears northeast, vessel sighted at 10:15...)"
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 resize-none"
              disabled={isSubmitting}
            />
          </div>
          <Button type="submit" variant="default" size="sm" disabled={isSubmitting || !text.trim() || text.trim().length < 2} className="w-full">
            {isSubmitting ? "Adding..." : "Add Observation"}
          </Button>
        </form>

        {observations.length > 0 && (
          <div className="pt-4 border-t border-white/5 space-y-2">
            <div className="text-xs font-semibold tracking-widest text-slate-400">Previous Observations</div>
            {observations.slice().reverse().map((obs, i) => (
              <motion.div key={obs.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">👤</span>
                    <span className="text-sm font-medium text-slate-200">{obs.author}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0">{formatUtcTime(obs.createdAt)}</span>
                </div>
                <p className="text-sm text-slate-300 italic">“{obs.text}”</p>
              </motion.div>
            ))}
          </div>
        )}

        {observations.length === 0 && !isSubmitting && (
          <div className="text-slate-500 text-sm text-center py-8">No human observations yet</div>
        )}
      </CardContent>
    </Card>
  );
}