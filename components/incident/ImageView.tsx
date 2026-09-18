"use client";
import { formatUtcTime } from "@/lib/utils";
export function ImageView({ detection, image, incident }: { detection:any; image:any; incident:any }){
  const sourceType = image?.sourceType || (detection?.raw?.mode==="LIVE" ? "LIVE" : "DEMO");
  const confidence = detection?.confidence ?? 0.91;
  const live = image?.metadata?.liveObservation || detection?.raw?.liveObservation;
  const isLive = sourceType==="LIVE" || live;
  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-slate-900">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-slate-800/50">
        <span className="text-xs tracking-widest font-semibold text-slate-400">{isLive ? "LIVE SATELLITE SAR VIEW" : sourceType==="DEMO" ? "DEMO / SIMULATED SAR VIEW" : "SATELLITE / IMAGE INVESTIGATION VIEW"}</span>
        <span className={`text-[10px] px-2 py-1 rounded-full font-bold border ${isLive ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : sourceType==="DEMO" ? "bg-sky-500/20 text-sky-300 border-sky-500/30" : sourceType==="USER_UPLOAD" ? "bg-violet-500/20 text-violet-300 border-violet-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"}`}>{isLive ? "LIVE SATELLITE" : sourceType==="DEMO" ? "DEMO/SIMULATED" : sourceType} IMAGE</span>
      </div>
      <div className="relative aspect-[16/10] bg-gradient-to-br from-slate-800 via-slate-900 to-black overflow-hidden">
        {isLive && image?.url?.startsWith("data:image") ? (
          <img src={image.url} alt="LIVE SAR preview" className="absolute inset-0 w-full h-full object-cover opacity-90" />
        ) : isLive && image?.url?.startsWith("http") ? (
          <img src={image.url} alt="LIVE SAR preview" className="absolute inset-0 w-full h-full object-cover opacity-80" />
        ) : (
          <div className="absolute inset-0 opacity-40" style={{ background: `radial-gradient(ellipse at 50% 40%, rgba(6,182,212,0.15), transparent 60%), repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3px)` }} />
        )}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-[11px] tracking-widest text-cyan-400 mb-2">{isLive ? `${live?.satellite || "Sentinel-1"} · LIVE` : "SENTINEL-1 SAR"} · {incident?.location?.label || "Arabian Sea"} · POTENTIAL ANOMALY</div>
            {!isLive && (
            <div className="mx-auto w-[72%] h-28 rounded-xl border border-amber-400/40 bg-amber-500/10 backdrop-blur flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
              <span className="text-xs text-amber-200 font-medium">Dark elongated anomaly — wind-aligned</span>
            </div>
            )}
            {isLive && live && (
              <div className="mx-auto w-[85%] rounded-lg bg-black/60 border border-emerald-500/30 p-2 text-[10px] text-left space-y-1">
                <div>Provider: {live.provider}</div>
                <div>Satellite: {live.satellite}</div>
                <div>Scene: {live.productId}</div>
                <div>Acquired: {formatUtcTime(live.acquiredAt)}</div>
              </div>
            )}
            <div className="text-[11px] text-slate-500 mt-3">Detection: “Potential oil-like anomaly” · Confidence {(confidence*100).toFixed(0)}% · Area {detection?.affectedAreaEstimate ?? 23}% · {detection?.detectionMethod}</div>
          </div>
        </div>
        {/* bbox markers */}
        <div className="absolute top-3 left-3 text-[9px] text-white/60 bg-black/40 px-1.5 py-0.5 rounded border border-white/10">19.2°N 64.5°E</div>
        <div className="absolute bottom-3 right-3 text-[9px] text-white/60 bg-black/40 px-1.5 py-0.5 rounded border border-white/10">T+0 · {formatUtcTime(detection?.timestamp)}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3 bg-slate-800/30 text-xs">
        <div className="rounded-lg bg-white/5 border border-white/5 p-2"><div className="text-slate-400 text-[10px]">CONFIDENCE</div><div className="font-bold text-cyan-300">{(confidence*100).toFixed(0)}%</div></div>
        <div className="rounded-lg bg-white/5 border border-white/5 p-2"><div className="text-slate-400 text-[10px]">AREA</div><div className="font-bold">{detection?.affectedAreaEstimate ?? 23}%</div></div>
        <div className="rounded-lg bg-white/5 border border-white/5 p-2"><div className="text-slate-400 text-[10px]">METHOD</div><div className="font-medium text-[11px] leading-tight">{detection?.detectionMethod?.slice(0,32)}</div></div>
      </div>
    </div>
  );
}
