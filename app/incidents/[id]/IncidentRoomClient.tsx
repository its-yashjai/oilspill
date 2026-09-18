"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLiveKit } from "@/hooks/useLiveKit";
import { TopBar } from "@/components/incident/TopBar";
import { TimelinePanel } from "@/components/incident/TimelinePanel";
import { CollaborativeAIPanel } from "@/components/incident/CollaborativeAIPanel";
import { EvidencePanel } from "@/components/incident/EvidencePanel";
import { FindingsPanel } from "@/components/incident/FindingsPanel";
import { HumanObservationPanel } from "@/components/incident/HumanObservationPanel";
import { HumanDecisionPanel } from "@/components/incident/HumanDecisionPanel";
import { ContextVersionPanel } from "@/components/incident/ContextVersionPanel";
import { MossPanel } from "@/components/incident/MossPanel";
import { ImageViewer } from "@/components/incident/ImageViewer";
import { LiveWorldMap } from "@/components/incident/LiveWorldMap";
import type { AgentStatus } from "@/lib/agents/types";

interface IncidentRoomClientProps {
  initialData: {
    mossConfigured: boolean;
    incident: any;
    detection: any;
    images: any[];
    findings: any[];
    observations: any[];
    timeline: any[];
    contextVersions: any[];
    disagreements: any[];
    gaps: any[];
    agentRuns?: any[];
  };
}

const SEA_REGION_PRESETS: Record<string, { name: string; center: { lat: number; lon: number }; bbox: [number,number,number,number] }> = {
  "arabian sea": { name: "Arabian Sea", center: { lat: 19.2, lon: 64.5 }, bbox: [64.0, 18.7, 65.0, 19.7] },
  "bay of bengal": { name: "Bay of Bengal", center: { lat: 16.5, lon: 88.0 }, bbox: [82.0, 5.5, 92.0, 22.5] },
  "red sea": { name: "Red Sea", center: { lat: 21.5, lon: 37.5 }, bbox: [34.0, 12.5, 42.5, 28.0] },
  "mediterranean": { name: "Mediterranean", center: { lat: 34.5, lon: 22.0 }, bbox: [10.0, 30.0, 36.0, 46.0] },
  "mediterranean sea": { name: "Mediterranean Sea", center: { lat: 34.5, lon: 22.0 }, bbox: [10.0, 30.0, 36.0, 46.0] },
  "south china sea": { name: "South China Sea", center: { lat: 15.0, lon: 115.0 }, bbox: [105.0, 0.0, 120.0, 25.0] },
  "gulf of mexico": { name: "Gulf of Mexico", center: { lat: 26.0, lon: -89.0 }, bbox: [-98.0, 18.0, -80.0, 31.0] },
};

export function IncidentRoomClient({ initialData }: IncidentRoomClientProps) {
  const [incident, setIncident] = useState(initialData.incident);
  const [detection, setDetection] = useState(initialData.detection);
  const [images, setImages] = useState(initialData.images);
  const [findings, setFindings] = useState(initialData.findings);
  const [observations, setObservations] = useState(initialData.observations);
  const [timeline, setTimeline] = useState(initialData.timeline);
  const [contextVersions, setContextVersions] = useState(initialData.contextVersions);
  const [disagreements, setDisagreements] = useState(initialData.disagreements);
  const [gaps, setGaps] = useState(initialData.gaps);
  const [agentRuns, setAgentRuns] = useState<any[]>(initialData.agentRuns || []);
  const [viewMode, setViewMode] = useState<"before"|"after"|"split">("after");
  const processedEventsRef = useRef<Set<string>>(new Set());
  const incidentRef = useRef(incident);
  useEffect(() => { incidentRef.current = incident; }, [incident]);

  const handleRealtimeEvent = useCallback((event: any) => {
    if (!event || typeof event.type !== "string") return;
    const eventId = event.eventId as string | undefined;
    if (eventId) {
      if (processedEventsRef.current.has(eventId)) return;
      processedEventsRef.current.add(eventId);
      if (processedEventsRef.current.size > 500) {
        const first = processedEventsRef.current.values().next().value;
        if (first) processedEventsRef.current.delete(first);
      }
    }
    const payload = event.payload as any;
    if (event.type === "context.updated" && payload?.contextVersion) {
      const incoming = Number(payload.contextVersion);
      const current = Number(incidentRef.current.contextVersion);
      if (Number.isFinite(incoming) && Number.isFinite(current) && incoming < current) return;
      if (Number.isFinite(incoming) && incoming > current + 5) {
        fetch(`/api/incidents/${incidentRef.current.id}`).then(r=>r.json()).then(d=>{
          if (!d.incident) return;
          setIncident(d.incident);
          setDetection(d.detection);
          setImages(d.images || []);
          setFindings(d.findings || []);
          setObservations(d.observations || []);
          setTimeline(d.timeline || []);
          setContextVersions(d.contextVersions || []);
          setDisagreements(d.disagreements || []);
          setGaps(d.gaps || []);
        }).catch(()=>{});
        return;
      }
    }
    switch (event.type) {
      case "finding.created":
      case "finding.updated":
        if (!payload?.finding?.id) return;
        setFindings((prev: any[]) => {
          const existing = prev.findIndex(f => f.id === payload.finding.id);
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = payload.finding;
            return next;
          }
          return [...prev, payload.finding];
        });
        break;
      case "finding.stale":
        if (!payload?.findingId) return;
        setFindings((prev: any[]) => prev.map(f => f.id === payload.findingId ? { ...f, status: "stale" } : f));
        break;
      case "context.updated":
        if (!payload?.contextVersion) return;
        setIncident((prev: any) => ({ ...prev, contextVersion: payload.contextVersion }));
        if (payload.context) setContextVersions((prev: any[]) => prev.some(c=>c.version===payload.contextVersion || c.id===payload.context.id) ? prev : [...prev, payload.context]);
        break;
      case "observation.created":
        if (!payload?.observation?.id) return;
        setObservations((prev: any[]) => prev.some(o=>o.id===payload.observation.id) ? prev : [...prev, payload.observation]);
        if (payload.timeline) setTimeline((prev: any[]) => prev.some(t=>t.id===payload.timeline.id) ? prev : [...prev, payload.timeline]);
        break;
      case "decision.created":
        if (!payload?.decision?.id) return;
        setIncident((prev: any) => ({ ...prev, decisions: [...(prev.decisions || []), payload.decision] }));
        if (payload.timeline) setTimeline((prev: any[]) => prev.some(t=>t.id===payload.timeline.id) ? prev : [...prev, payload.timeline]);
        break;
      case "incident.status_changed":
        if (!payload?.status) return;
        setIncident((prev: any) => ({ ...prev, status: payload.status }));
        break;
      case "timeline.created":
        if (payload?.payload) {
          const inner = payload.payload as any;
          const tid = inner?.finding?.id || inner?.observation?.id || inner?.decision?.id || eventId;
          setTimeline((prev: any[]) => prev.some(t=>t.id===tid || t.payload?.finding?.id===inner?.finding?.id) ? prev : [...prev, { id: tid || `rt-${Date.now()}`, incidentId: event.incidentId, type: inner?.finding ? "finding_created" : "timeline.created", payload: inner, createdAt: event.timestamp }].slice(-200));
        }
        break;
      case "agent.started":
        setAgentRuns((prev: any[]) => {
          const idx = prev.findIndex(r => r.agentType === payload?.agentType);
          if (idx >= 0) { const n=[...prev]; n[idx]={...n[idx], status:"running"}; return n; }
          return [...prev, { agentType: payload?.agentType, status:"running", id:`run-${payload?.agentType}`}];
        });
        break;
      case "agent.completed":
        setAgentRuns((prev: any[]) => {
          const idx = prev.findIndex(r => r.agentType === payload?.agentType);
          if (idx >= 0) { const n=[...prev]; n[idx]={...n[idx], status:"completed"}; return n; }
          return [...prev, { agentType: payload?.agentType, status:"completed", id:`run-${payload?.agentType}`}];
        });
        break;
      case "agent.failed":
        setAgentRuns((prev: any[]) => {
          const idx = prev.findIndex(r => r.agentType === payload?.agentType);
          if (idx >= 0) { const n=[...prev]; n[idx]={...n[idx], status:"failed", error: payload?.error}; return n; }
          return [...prev, { agentType: payload?.agentType, status:"failed", id:`run-${payload?.agentType}`}];
        });
        break;
      case "agent.progress":
        break;
    }
  }, []);

  const { isConnected: liveKitConnected, connectionState, error: liveKitError } = useLiveKit({
    incidentId: incident.id,
    onDataReceived: useCallback((payload: Uint8Array) => {
      try {
        const text = new TextDecoder().decode(payload);
        const event = JSON.parse(text);
        handleRealtimeEvent(event);
      } catch {}
    }, [handleRealtimeEvent]),
  });

  const addObservation = async (text: string) => {
    try {
      const res = await fetch(`/api/incidents/${incident.id}/observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.observation) {
        setObservations((prev: any[]) => prev.some(o => o.id === data.observation.id) ? prev : [...prev, data.observation]);
        setTimeline((prev: any[]) => prev.some(t => t.id === data.timeline.id) ? prev : [...prev, data.timeline]);
        setIncident((prev: any) => ({ ...prev, contextVersion: data.contextVersion }));
        setContextVersions((prev: any[]) => [...prev, data.context]);
        
        const staleFindings = findings.filter(f => f.dependsOn?.some((d: string) => d === "wind/current" || d === "temporal_confirmation"));
        if (staleFindings.length > 0) {
          setFindings((prev: any[]) => prev.map(f => 
            staleFindings.some(sf => sf.id === f.id) ? { ...f, status: "stale" } : f
          ));
        }
      }
    } catch (e) {
      console.error("Failed to add observation:", e);
    }
  };

  const makeDecision = async (action: string, reasoning: string) => {
    try {
      const res = await fetch(`/api/incidents/${incident.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reasoning }),
      });
      const data = await res.json();
      if (data.decision) {
        setIncident((prev: any) => ({ 
          ...prev, 
          status: data.incidentStatus || prev.status,
          decisions: [...(prev.decisions || []), data.decision]
        }));
        setTimeline((prev: any[]) => prev.some(t => t.id === data.timeline.id) ? prev : [...prev, data.timeline]);
      }
    } catch (e) {
      console.error("Failed to make decision:", e);
    }
  };

  const onReassess = (findingId: string) => {
    console.log("Reassess finding:", findingId);
  };

  const primaryImage = images[0];
  
  const getAgentStatus = (agentType: string): AgentStatus => {
    const run = agentRuns.find(r => r.agentType === agentType);
    if (run) {
      if (run.status === "completed") return "completed";
      if (run.status === "failed" || run.status === "error") return "error";
      if (run.status === "running" || run.status === "searching" || run.status === "analyzing") return agentType==="historical" ? "searching" : "analyzing";
      if (run.status === "queued" || run.status === "waiting") return "waiting";
      if (run.status === "reassessing") return "reassessing";
    }
    const active = findings.find(f => f.agentType === agentType && f.status === "active");
    const stale = findings.some(f => f.agentType === agentType && f.status === "stale");
    if (active) return "completed";
    if (stale) return "reassessing";
    switch (agentType) {
      case "historical": return "searching";
      case "investigation": return "analyzing";
      case "evidence": return findings.length >= 2 ? "analyzing" : "waiting";
      default: return "idle";
    }
  };

  const agentData = [
    { 
      id: "historical", 
      name: "Historical Intelligence Agent",
      status: getAgentStatus("historical"),
      mossLatency: findings.find(f => f.agentType === "historical")?.mossLatencyMs 
    },
    { 
      id: "investigation", 
      name: "Investigation Agent",
      status: getAgentStatus("investigation")
    },
    { 
      id: "evidence", 
      name: "Evidence / Assessment Agent",
      status: getAgentStatus("evidence")
    },
  ];

  if (findings.length === 0) {
    agentData.forEach(a => {
      if (a.id === "historical") a.status = "searching";
      if (a.id === "investigation") a.status = "analyzing";
      if (a.id === "evidence") a.status = "waiting";
    });
  }

  const historicalFinding = findings.find(f => f.agentType === "historical");
  const investigationFinding = findings.find(f => f.agentType === "investigation");
  const evidenceFinding = findings.find(f => f.agentType === "evidence");

  const totalMossLatency = (historicalFinding?.mossLatencyMs || 0) + (investigationFinding?.mossLatencyMs || 0) + (evidenceFinding?.mossLatencyMs || 0);
  const totalQueries = (historicalFinding?.mossEvidenceIds?.length || 0) + (investigationFinding?.mossEvidenceIds?.length || 0) + (evidenceFinding?.mossEvidenceIds?.length || 0);
  const totalResults = (historicalFinding?.mossEvidenceIds?.length || 0) + (investigationFinding?.mossEvidenceIds?.length || 0) + (evidenceFinding?.mossEvidenceIds?.length || 0);

  // Derive CURRENT/PREVIOUS observations from detection raw and images (persisted pair, never duplicate)
  const currentObservation: any = detection?.raw?.liveObservation || images.find((img:any)=> img.metadata?.role==="current")?.metadata?.observation || images.find((img:any)=> img.metadata?.observation)?.metadata?.observation || null;
  const previousObservation: any = detection?.raw?.previousObservation || images.find((img:any)=> img.metadata?.role==="previous")?.metadata?.observation || null;
  const hasTemporalPair = !!(currentObservation && previousObservation && previousObservation.productId && previousObservation.productId !== "NONE" && previousObservation.productId !== currentObservation.productId && previousObservation.acquiredAt !== currentObservation.acquiredAt);

  // Derive monitoring region from incident (bbox must drive STAC, already stored in location/footprint)
  const incidentBbox = (incident.location as any)?.bbox || (incident.location as any)?.footprint?.bbox;
  const regionKey = (incident.region || "").toLowerCase();
  const preset = SEA_REGION_PRESETS[regionKey];
  const monitoringRegion = {
    id: preset ? regionKey.replace(/\s+/g,"-") : incident.id,
    name: incident.region || preset?.name || "Arabian Sea",
    bbox: (incidentBbox && Array.isArray(incidentBbox) && incidentBbox.length===4 ? incidentBbox : preset?.bbox || [64.0, 18.7, 65.0, 19.7]) as [number,number,number,number],
    center: { lat: (incident.location as any)?.lat ?? preset?.center.lat ?? 19.2, lon: (incident.location as any)?.lon ?? preset?.center.lon ?? 64.5 },
  };

  const handleRegionChange = (regionId: string) => {
    const r = SEA_REGION_PRESETS[regionId] || SEA_REGION_PRESETS[regionKey];
    if (!r) return;
    // For existing incident, just update viewport (pan/zoom must not trigger satellite requests)
    // Region bbox already drives initial STAC query at creation; subsequent map navigation is local
    // Stale prevention: no async fetch here, so no overwrite risk
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <TopBar 
        incident={incident} 
        detection={detection} 
        liveKitConnected={liveKitConnected}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 items-start min-h-0">
        <div className="lg:col-span-3 space-y-4 min-h-0 min-w-0">
          <TimelinePanel timeline={timeline} />
        </div>

        <div className="lg:col-span-6 space-y-4 min-h-0 min-w-0 flex flex-col">
          {/* LIVE World Map - renders immediately, satellite overlays async, geographic footprint */}
          <div className="relative w-full rounded-xl overflow-hidden border border-white/10 h-[380px] lg:h-[520px] min-h-[320px] min-h-0 shrink-0 block">
            <LiveWorldMap
              incidentId={incident.id}
              currentObservation={currentObservation}
              previousObservation={hasTemporalPair ? previousObservation : null}
              monitoringRegion={monitoringRegion}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onRegionChange={handleRegionChange}
            />
          </div>

          <ImageViewer detection={detection} image={primaryImage} incident={incident} />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MossPanel configured={initialData.mossConfigured} findings={findings} mossMetrics={{ 
              totalLatencyMs: totalMossLatency, 
              queryCount: totalQueries, 
              resultCount: totalResults 
            }} />
            <div className="rounded-xl border border-white/10 bg-slate-800/50 p-4">
              <div className="text-xs tracking-widest font-semibold text-slate-400 mb-3">TEMPORAL COMPARISON</div>
              <div className="text-sm text-slate-300">
                {hasTemporalPair ? (
                  <>
                    <div className="font-medium text-cyan-400 mb-1">Potential SAR change detected between observations.</div>
                    <div className="text-[11px] font-mono">Previous: {previousObservation.productId} <span className="text-slate-500">({previousObservation.acquiredAt})</span></div>
                    <div className="text-[11px] font-mono">Current: {currentObservation.productId} <span className="text-slate-500">({currentObservation.acquiredAt})</span></div>
                    <div className="mt-2 text-[11px] text-slate-400">Time gap: {detection?.raw?.comparison?.hoursApart ?? Math.round((new Date(currentObservation.acquiredAt).getTime() - new Date(previousObservation.acquiredAt).getTime())/3600000)}h · {detection?.raw?.comparison?.hoursApart && detection.raw.comparison.hoursApart>=24 && detection.raw.comparison.hoursApart<=72 ? "preferred 24–72h window" : "bounded fallback"}</div>
                    <div className="mt-2 text-amber-300 text-xs">SAR alone does not confirm oil spill — requires human review.</div>
                  </>
                ) : (
                  <>
                    <div className="text-slate-500 text-xs">Previous scene unavailable — temporal comparison not possible.</div>
                    {currentObservation && <><div className="mt-1 text-[11px] font-mono">Current: {currentObservation.productId} <span className="text-slate-500">({currentObservation.acquiredAt})</span></div><div className="mt-1 text-[11px] text-slate-500">Single observation only. No duplication. Not using DEMO fallback in LIVE.</div></>}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4 min-h-0 min-w-0">
          <CollaborativeAIPanel 
            findings={findings}
            mossMetrics={{ totalLatencyMs: totalMossLatency, queryCount: totalQueries, resultCount: totalResults }}
            contextVersion={incident.contextVersion}
            agents={agentData}
            incidentId={incident.id}
          />

          <FindingsPanel 
            findings={findings} 
            contextVersion={incident.contextVersion}
            incidentId={incident.id}
            onReassess={onReassess}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 px-4 pb-4">
        <div className="lg:col-span-4">
          <EvidencePanel 
            findings={findings}
            observations={observations}
            images={images}
            detection={detection}
            disagreements={disagreements}
            gaps={gaps}
          />
        </div>
        <div className="lg:col-span-4">
          <HumanObservationPanel 
            incidentId={incident.id}
            observations={observations}
            onAddObservation={addObservation}
          />
        </div>
        <div className="lg:col-span-4">
          <HumanDecisionPanel 
            incidentId={incident.id}
            incident={incident}
            findings={findings}
            onDecision={makeDecision}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 px-4 pb-4">
        <div className="lg:col-span-12">
          <ContextVersionPanel 
            contextVersions={contextVersions}
            currentVersion={incident.contextVersion}
          />
        </div>
      </div>
    </div>
  );
}

type RemoteParticipant = import("livekit-client").RemoteParticipant;