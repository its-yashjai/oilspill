"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatUtcTimestamp } from "@/lib/utils";

const REGION_PRESETS = [
  { id: "arabian-sea", name: "Arabian Sea", center: { lat: 19.2, lon: 64.5 }, bbox: [64.0, 18.7, 65.0, 19.7] as [number,number,number,number] },
  { id: "bay-of-bengal", name: "Bay of Bengal", center: { lat: 16.5, lon: 88.0 }, bbox: [82.0, 5.5, 92.0, 22.5] as [number,number,number,number] },
  { id: "red-sea", name: "Red Sea", center: { lat: 21.5, lon: 37.5 }, bbox: [34.0, 12.5, 42.5, 28.0] as [number,number,number,number] },
  { id: "mediterranean", name: "Mediterranean Sea", center: { lat: 34.5, lon: 22.0 }, bbox: [10.0, 30.0, 36.0, 46.0] as [number,number,number,number] },
  { id: "south-china-sea", name: "South China Sea", center: { lat: 15.0, lon: 115.0 }, bbox: [105.0, 0.0, 120.0, 25.0] as [number,number,number,number] },
  { id: "gulf-of-mexico", name: "Gulf of Mexico", center: { lat: 26.0, lon: -89.0 }, bbox: [-98.0, 18.0, -80.0, 31.0] as [number,number,number,number] },
];

export function HomeClient({ initialIncidents }: { initialIncidents: any[] }) {
  const [incidents, setIncidents] = useState(initialIncidents);
  const [creating, setCreating] = useState(false);
  const [liveCreating, setLiveCreating] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState("arabian-sea");
  const router = useRouter();
  const selectedRegion = REGION_PRESETS.find(r=>r.id===selectedRegionId) || REGION_PRESETS[0];

  const handleNew = async () => {
    setCreating(true);
    try {
      const id = `demo-${crypto.randomUUID()}`;
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, region: selectedRegion.name, location: { lat: selectedRegion.center.lat, lon: selectedRegion.center.lon, label: selectedRegion.name }, bbox: selectedRegion.bbox, sourceImageId: "DEMO-SAR-001", mode: "DEMO" }),
      });
      const data = await res.json();
      const newId = data.incident?.id || id;
      router.push(`/incidents/${newId}`);
    } catch {
      setCreating(false);
    }
  };

  const handleLive = async () => {
    setLiveCreating(true);
    setLiveError(null);
    try {
      const id = `live-${crypto.randomUUID()}`;
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, region: selectedRegion.name, location: { lat: selectedRegion.center.lat, lon: selectedRegion.center.lon, label: selectedRegion.name }, bbox: selectedRegion.bbox, mode: "LIVE" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLiveError(data.error || "LIVE acquisition failed");
        setLiveCreating(false);
        return;
      }
      router.push(`/incidents/${data.incident?.id || id}`);
    } catch (e: any) {
      setLiveError(e.message || "LIVE failed");
      setLiveCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete ${id}?`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/incidents/${id}`, { method: "DELETE" });
      if (res.ok) setIncidents(prev => prev.filter(i => i.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteDemo = async () => {
    if (!confirm("Delete ALL demo/simulated investigations? This will not affect LIVE data.")) return;
    const res = await fetch("/api/incidents/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filter: "demo" }) });
    if (res.ok) {
      const data = await res.json();
      setIncidents(prev => prev.filter(i => !data.deletedIds?.includes(i.id)));
      router.refresh();
    }
  };

  return (
    <main className="min-h-screen p-8 bg-slate-950 text-slate-100">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter">BlueSentinel — Oil Spill Intelligence</h1>
          <p className="text-slate-400 mt-2">Near-real-time collaborative investigation workspace</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select value={selectedRegionId} onChange={e=>setSelectedRegionId(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-sm">
            {REGION_PRESETS.map(r=> <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <Button onClick={handleNew} disabled={creating} size="lg" className="bg-cyan-600 hover:bg-cyan-500">
            {creating ? "Creating…" : "+ New Investigation (DEMO)"}
          </Button>
          <Button onClick={handleLive} disabled={liveCreating} size="lg" variant="outline" className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
            {liveCreating ? "Acquiring LIVE SAR…" : `LIVE SATELLITE (${selectedRegion.name})`}
          </Button>
          <Link href="/demo" className="inline-flex items-center px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-sm">Open Demo Page</Link>
          <Button variant="outline" onClick={handleDeleteDemo} className="border-red-500/30 text-red-300 hover:bg-red-500/10">Delete Demo Data</Button>
        </div>
        {liveError && <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300">LIVE acquisition failed: {liveError} — no DEMO fallback. Click New Investigation (DEMO) to use simulated data.</div>}
        <div className="text-xs text-slate-500">LIVE uses Copernicus STAC (sentinel-1-grd) + Sentinel Hub Process API via OAuth. Requires COPERNICUS_CLIENT_ID/SECRET. DEMO works without credentials.</div>

        <Card className="border-white/10">
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <span className="text-xs font-semibold tracking-widest text-slate-400">SAVED INVESTIGATIONS</span>
            <Badge variant="outline" className="text-[10px]">{incidents.length} total</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {incidents.length === 0 && <div className="text-slate-500 text-sm py-8 text-center">No saved investigations yet — start a new one.</div>}
            {incidents.map((inc) => (
              <div key={inc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-cyan-300 truncate">{inc.id}</span>
                    <Badge variant="outline" className={`text-[10px] ${inc.id.startsWith("live-")?"bg-emerald-500/20 text-emerald-300 border-emerald-500/30":"bg-sky-500/20 text-sky-300 border-sky-500/30"}`}>{inc.id.startsWith("live-")?"LIVE":"DEMO"}</Badge>
                    <Badge variant="outline" className="text-[10px]">{inc.status}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${inc.severity==="elevated"?"text-red-400":"text-slate-400"}`}>{inc.severity}</Badge>
                    <Badge variant="outline" className="text-[10px]">v{inc.contextVersion}</Badge>
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-2">
                    <span>{inc.region} · {inc.location?.label}</span>
                    <span>·</span>
                    <span>Created {formatUtcTimestamp(inc.createdAt)}</span>
                    <span>·</span>
                    <span>Updated {formatUtcTimestamp(inc.updatedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/incidents/${inc.id}`} className="px-3 py-1.5 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 text-sm hover:bg-cyan-600/30">Open</Link>
                  <Button variant="outline" size="sm" disabled={deleting===inc.id} onClick={()=>handleDelete(inc.id)} className="border-red-500/20 text-red-300">{deleting===inc.id?"…":"Delete"}</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
