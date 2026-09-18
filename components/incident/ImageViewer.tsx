"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { formatUtcTime } from "@/lib/utils";

interface ImageViewerProps {
  detection: any;
  image: any;
  incident: any;
}

export function ImageViewer({ detection, image, incident }: ImageViewerProps) {
  const sourceType = image?.sourceType || (detection?.raw?.mode === "LIVE" ? "LIVE" : "DEMO");
  const confidence = detection?.confidence ?? 0.91;
  const live = image?.metadata?.liveObservation || detection?.raw?.liveObservation;
  const isLive = sourceType === "LIVE" || (detection?.raw?.mode === "LIVE");
  const liveMeta = image?.metadata?.liveObservation || detection?.raw?.liveObservation;

  // Zoom/pan state
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom constants
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 5;
  const SCALE_STEP = 0.25;
  const SCALE_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

  // Calculate fit scale
  const calculateFitScale = useCallback(() => {
    if (!containerRef.current || !imageRef.current) return 1;
    const container = containerRef.current;
    const image = imageRef.current;
    if (!image.naturalWidth || !image.naturalHeight) return 1;

    const containerRect = container.getBoundingClientRect();
    const scaleX = containerRect.width / image.naturalWidth;
    const scaleY = containerRect.height / image.naturalHeight;
    return Math.min(scaleX, scaleY, 1);
  }, []);

  // Reset to fit
  const handleFit = useCallback(() => {
    const fitScale = calculateFitScale();
    setScale(fitScale);
    setTranslate({ x: 0, y: 0 });
  }, [calculateFitScale]);

  // Zoom in
  const handleZoomIn = useCallback(() => {
    setScale(prev => {
      const currentIndex = SCALE_LEVELS.findIndex(level => level >= scale - 0.001);
      const nextIndex = Math.min(currentIndex + 1, SCALE_LEVELS.length - 1);
      return Math.min(SCALE_LEVELS[nextIndex], MAX_SCALE);
    });
  }, [scale]);

  // Zoom out
  const handleZoomOut = useCallback(() => {
    setScale(prev => {
      const currentIndex = SCALE_LEVELS.findIndex(level => level >= scale - 0.001);
      const prevIndex = Math.max(currentIndex - 1, 0);
      return Math.max(SCALE_LEVELS[prevIndex], MIN_SCALE);
    });
  }, [scale]);

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setScale(prev => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev * (e.deltaY > 0 ? 0.9 : 1.1)));
      return newScale;
    });
  }, []);

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - translate.x, y: e.clientY - translate.y });
  }, [translate, scale]);

  // Handle drag
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setTranslate({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  // Handle drag end
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Prevent drag when clicking image
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      e.stopPropagation();
    }
  }, [isDragging]);

  // Auto-fit on image load
  useEffect(() => {
    if (imageRef.current && imageRef.current.complete) {
      const fitScale = calculateFitScale();
      setScale(fitScale);
    }
  }, [imageRef.current?.src, calculateFitScale]);

  // Clean up drag on unmount
  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleMouseMove as any);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleMouseMove as any);
    };
  }, [handleMouseMove]);

  const imageStyle = {
    transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
    transformOrigin: "center center",
    transition: "transform 0.1s ease-out",
  };

  const containerStyle = {
    width: "100%",
    height: "100%",
    overflow: "hidden",
  };

  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-slate-800/50">
        <span className="text-xs tracking-widest font-semibold text-slate-400">
          {sourceType === "LIVE" ? "LIVE SATELLITE SAR VIEW" : sourceType === "DEMO" ? "DEMO / SIMULATED SAR VIEW" : "SATELLITE / IMAGE INVESTIGATION VIEW"}
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-1 rounded-full font-bold border ${
            sourceType === "LIVE" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
            sourceType === "DEMO" ? "bg-sky-500/20 text-sky-300 border-sky-500/30" :
            sourceType === "USER_UPLOAD" ? "bg-violet-500/20 text-violet-300 border-violet-500/30" :
            "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
          }`}>
            {sourceType === "LIVE" ? "LIVE SATELLITE" : sourceType === "DEMO" ? "DEMO/SIMULATED" : sourceType} IMAGE
          </span>
        </div>
      </div>

      {/* Image Viewer */}
      <div className="relative" style={{ aspectRatio: "16/10" }} ref={containerRef}>
        <div 
          ref={containerRef} 
          className="relative w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-black overflow-hidden"
          style={containerStyle}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setIsDragging(false)}
        >
          {/* Image */}
          {(isLive && image?.url?.startsWith("data:image")) ? (
            <img
              ref={imageRef}
              src={image.url}
              alt="LIVE SAR preview"
              className="w-full h-full object-contain"
              style={{ ...imageStyle, opacity: 0.9 }}
              onLoad={() => handleFit()}
            />
          ) : isLive && image?.url?.startsWith("http") ? (
            <img
              ref={imageRef}
              src={image.url}
              alt="LIVE SAR preview"
              className="w-full h-full object-contain"
              style={{ ...imageStyle, opacity: 0.8 }}
              onLoad={() => handleFit()}
            />
          ) : image?.url ? (
            <img
              ref={imageRef}
              src={image.url}
              alt={isLive ? "LIVE SAR preview" : "SAR preview"}
              className="w-full h-full object-contain"
              style={imageStyle}
              onLoad={() => handleFit()}
            />
          ) : (
            <div className="absolute inset-0 opacity-40" style={{ background: `radial-gradient(ellipse at 50% 40%, rgba(6,182,212,0.15), transparent 60%), repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3px)` }} />
          )}

          {/* Zoom controls */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1 p-1 bg-black/60 rounded-lg border border-white/10">
            <button
              onClick={handleZoomOut}
              disabled={scale <= MIN_SCALE}
              className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
              aria-label="Zoom out"
              title="Zoom out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
            </button>
            <button
              onClick={handleFit}
              className="px-2 py-1 text-[10px] text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
              aria-label="Fit to view"
              title="Fit to view"
            >
              Fit
            </button>
            <button
              onClick={handleZoomIn}
              disabled={scale >= MAX_SCALE}
              className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
              aria-label="Zoom in"
              title="Zoom in"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
            <span className="text-[10px] text-white/60 px-1 font-mono">
              {(scale * 100).toFixed(0)}%
            </span>
          </div>

          {/* Live metadata badge - moved to corner, not overlaid on image content */}
          {isLive && liveMeta && (
            <div className="absolute top-3 left-3 w-[85%] rounded-lg bg-black/70 border border-emerald-500/30 p-2 text-[10px] text-left space-y-1 pointer-events-none">
              <div>Provider: {live.provider}</div>
              <div>Satellite: {live.satellite}</div>
              <div>Scene: {live.productId}</div>
              <div>Acquired: {formatUtcTime(live.acquiredAt)}</div>
            </div>
          )}

          {/* BBox markers */}
          <div className="absolute top-3 left-3 text-[9px] text-white/60 bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
            {live ? `${live.aoi?.lat?.toFixed(1)}°N ${live.aoi?.lon?.toFixed(1)}°E` : "19.2°N 64.5°E"}
          </div>
          <div className="absolute bottom-3 right-3 text-[9px] text-white/60 bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
            T+0 · {formatUtcTime(detection?.timestamp)}
          </div>
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 p-1 bg-black/60 rounded-lg border border-white/10">
          <button
            onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
            disabled={scale <= 0.5}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
          </button>
          <button
            onClick={() => setScale(1)}
            className="px-2 py-1 text-[10px] text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
            aria-label="Reset zoom"
            title="Reset zoom"
          >
            Fit
          </button>
          <button
            onClick={() => setScale(s => Math.min(5, s + 0.25))}
            disabled={scale >= 4}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </button>
          <span className="text-[10px] text-white/60 px-1 font-mono">
            {(scale * 100).toFixed(0)}%
          </span>
        </div>
</div>
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-800/30 text-xs">
        <div className="rounded-lg bg-white/5 border border-white/5 p-2"><div className="text-slate-400 text-[10px]">CONFIDENCE</div><div className="font-bold text-cyan-300">{(confidence*100).toFixed(0)}%</div></div>
        <div className="rounded-lg bg-white/5 border border-white/5 p-2"><div className="text-slate-400 text-[10px]">AREA</div><div className="font-bold">{detection?.affectedAreaEstimate ?? 23}%</div></div>
        <div className="rounded-lg bg-white/5 border border-white/5 p-2"><div className="text-slate-400 text-[10px]">METHOD</div><div className="font-medium text-[11px] leading-tight">{detection?.detectionMethod?.slice(0,32)}</div></div>
      </div>
    </div>
  );
}