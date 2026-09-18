"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface TopBarProps {
  incident: any;
  detection: any;
  liveKitConnected: boolean;
  onStartDemo?: () => void;
}

export function TopBar({ incident, detection, liveKitConnected, onStartDemo }: TopBarProps) {
  const severityColors: Record<string, string> = {
    unresolved: "text-amber-400",
    low_concern: "text-emerald-400",
    elevated: "text-red-400",
    resolved: "text-sky-400",
  };

  const statusColors: Record<string, string> = {
    new: "text-sky-400",
    investigating: "text-amber-400",
    awaiting_human_review: "text-violet-400",
    escalated: "text-red-400",
    resolved: "text-emerald-400",
  };

  return (
    <Card className="border-b border-white/10">
      <CardContent className="py-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-cyan-400 tracking-tighter">BlueSentinel</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                INCIDENT ROOM
              </span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-sm">
              <span className="text-slate-400">ID:</span>
              <span className="font-mono font-medium text-cyan-300">{incident.id}</span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-sm">
              <span className="text-slate-400">📍</span>
              <span className="font-medium">{incident.location?.label || "Unknown location"}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <Badge variant="outline" className={`text-[10px] ${statusColors[incident.status] || "text-slate-400"}`}>
                {incident.status?.toUpperCase().replace("_", " ") || "UNKNOWN"}
              </Badge>
              <Badge variant="outline" className={`text-[10px] ${severityColors[incident.severity] || "text-slate-400"}`}>
                {incident.severity?.toUpperCase().replace("_", " ") || "UNRESOLVED"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                Context v{incident.contextVersion || 1}
              </Badge>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${liveKitConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
                <span className="text-[10px] text-slate-400">{liveKitConnected ? "LIVE" : "OFFLINE"}</span>
              </div>
            </div>
            {onStartDemo && (
              <Button variant="outline" size="sm" onClick={onStartDemo} className="hidden sm:inline-flex">
                Start Demo Investigation
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}