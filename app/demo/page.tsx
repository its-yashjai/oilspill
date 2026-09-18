"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function DemoPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incidentId, setIncidentId] = useState<string | null>(null);

  const handleStartDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "demo-incident-001",
          region: "Arabian Sea",
          location: { lat: 19.2, lon: 64.5, label: "Arabian Sea · Off Mumbai" },
          sourceImageId: "DEMO-SAR-001",
        }),
      });
      const data = await res.json();
      if (res.ok && data.incident?.id === "demo-incident-001") {
        setIncidentId(data.incident.id);
        window.location.href = `/incidents/${data.incident.id}`;
      } else {
        setError("Failed to create demo incident");
      }
    } catch (e) {
      setError("Error starting demo investigation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-2xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold tracking-tighter mb-4">
            <span className="text-cyan-400">BlueSentinel</span>
          </h1>
          <p className="text-slate-400 text-lg">
            Near-real-time collaborative oil-spill investigation platform
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="border-white/10">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Start Demo Investigation</CardTitle>
              <p className="text-slate-400 mt-2">
                Creates a deterministic demo incident in the Arabian Sea with SAR anomaly detection,
                then runs both AI agents to analyze the evidence.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 text-left">
                <div className="text-xs tracking-widest font-semibold text-slate-400 mb-3">DEMO SCENARIO</div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><span className="text-cyan-400">📍</span> <span>Region: Arabian Sea · Off Mumbai (19.2°N, 64.5°E)</span></div>
                  <div className="flex items-center gap-2"><span className="text-cyan-400">🛰</span> <span>Source: Sentinel-1 SAR (DEMO / SIMULATED)</span></div>
                  <div className="flex items-center gap-2"><span className="text-cyan-400">🔍</span> <span>Detection: SAR dark-region analysis</span></div>
                  <div className="flex items-center gap-2"><span className="text-cyan-400">🤖</span> <span>Agents: Historical Intelligence + Investigation + Evidence</span></div>
                  <div className="flex items-center gap-2"><span className="text-cyan-400">📚</span> <span>Retrieval: Moss knowledge base</span></div>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                <p className="text-sm text-amber-300">
                  <span className="font-medium">Note:</span> This uses deterministic demo data. The SAR image is simulated and clearly labeled
                  as DEMO / SIMULATED SAR. No live satellite API is called.
                </p>
              </div>

              <Button 
                size="lg" 
                className="w-full py-4 text-lg" 
                onClick={handleStartDemo} 
                disabled={loading}
              >
                {loading ? "Starting Investigation..." : "START DEMO INVESTIGATION"}
              </Button>

              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-red-300 text-sm">
                  {error}
                </div>
              )}

              {incidentId && (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-emerald-300 text-sm">
                  Created incident: <span className="font-mono">{incidentId}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <Card className="border-white/10">
            <CardContent className="p-4 text-center">
              <div className="text-3xl mb-2">🛰</div>
              <div className="text-sm font-medium">SAR Detection</div>
              <div className="text-xs text-slate-400 mt-1">Potential oil-like anomaly</div>
            </CardContent>
          </Card>
          <Card className="border-white/10">
            <CardContent className="p-4 text-center">
              <div className="text-3xl mb-2">🤝</div>
              <div className="text-sm font-medium">Agent Collaboration</div>
              <div className="text-xs text-slate-400 mt-1">Shared context via LiveKit</div>
            </CardContent>
          </Card>
          <Card className="border-white/10">
            <CardContent className="p-4 text-center">
              <div className="text-3xl mb-2">👤</div>
              <div className="text-sm font-medium">Human Decision</div>
              <div className="text-xs text-slate-400 mt-1">Final authority</div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </main>
  );
}

