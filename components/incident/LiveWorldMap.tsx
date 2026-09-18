"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibreglRaw from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
const maplibregl: any = maplibreglRaw as any;
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUtcTime } from "@/lib/utils";

interface LiveWorldMapProps {
  incidentId: string;
  currentObservation?: {
    previewUrl?: string;
    aoi: { lat: number; lon: number; bbox?: [number, number, number, number] };
    productId: string;
    satellite: string;
    acquiredAt: string;
    provider?: string;
    mode?: "DEMO" | "LIVE";
    confidence?: number;
    affectedAreaEstimate?: number;
    detectionMethod?: string;
    footprint?: { bbox?: [number,number,number,number]; geometry?: any };
  };
  previousObservation?: {
    previewUrl?: string;
    aoi: { lat: number; lon: number; bbox?: [number, number, number, number] };
    productId: string;
    satellite: string;
    acquiredAt: string;
    mode?: "DEMO" | "LIVE";
    footprint?: { bbox?: [number,number,number,number]; geometry?: any };
  } | null;
  monitoringRegion: {
    id: string;
    name: string;
    bbox: [number, number, number, number];
    center: { lat: number; lon: number };
  };
  viewMode: "before" | "after" | "split";
  onViewModeChange: (mode: "before" | "after" | "split") => void;
  onRegionChange?: (regionId: string) => void;
}

const SEA_PRESETS = [
  { id: "arabian-sea", name: "Arabian Sea", center: { lat: 19.2, lon: 64.5 }, bbox: [64.0, 18.7, 65.0, 19.7] },
  { id: "bay-of-bengal", name: "Bay of Bengal", center: { lat: 16.5, lon: 88.0 }, bbox: [82.0, 5.5, 92.0, 22.5] },
  { id: "red-sea", name: "Red Sea", center: { lat: 21.5, lon: 37.5 }, bbox: [34.0, 12.5, 42.5, 28.0] },
  { id: "mediterranean", name: "Mediterranean Sea", center: { lat: 34.5, lon: 22.0 }, bbox: [10.0, 30.0, 36.0, 46.0] },
  { id: "south-china-sea", name: "South China Sea", center: { lat: 15.0, lon: 115.0 }, bbox: [105.0, 0.0, 120.0, 25.0] },
  { id: "gulf-of-mexico", name: "Gulf of Mexico", center: { lat: 26.0, lon: -89.0 }, bbox: [-98.0, 18.0, -80.0, 31.0] },
];

const MAP_STYLE: any = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    "esri-satellite": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "© Esri, Maxar, Earthstar Geographics",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#0f172a" },
    },
    {
      id: "esri-satellite-basemap",
      type: "raster",
      source: "esri-satellite",
      paint: { "raster-opacity": 1 },
    },
  ],
};

export function LiveWorldMap({
  incidentId,
  currentObservation,
  previousObservation,
  monitoringRegion,
  viewMode,
  onViewModeChange,
  onRegionChange,
}: LiveWorldMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const currentLayerId = useRef<string | null>(null);
  const previousLayerId = useRef<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState(monitoringRegion.id);
  const [showRegionSelector, setShowRegionSelector] = useState(false);
  const [mapStyle, setMapStyle] = useState<"satellite" | "ocean">("satellite");
  const splitDividerRef = useRef<HTMLDivElement>(null);
  const [splitPosition, setSplitPosition] = useState(50);

  // Keep selectedRegion in sync when monitoringRegion prop changes (prevent stale)
  useEffect(() => { setSelectedRegion(monitoringRegion.id); }, [monitoringRegion.id]);

  // Stale prevention for async layer updates
  const layerRequestId = useRef(0);

  const getFootprintBbox = (obs: any): [number,number,number,number] | null => {
    // Prefer true footprint bbox, then aoi.bbox, then derived from lat/lon
    if (obs?.footprint?.bbox && Array.isArray(obs.footprint.bbox) && obs.footprint.bbox.length===4) return obs.footprint.bbox as [number,number,number,number];
    if (obs?.aoi?.bbox && Array.isArray(obs.aoi.bbox) && obs.aoi.bbox.length===4) return obs.aoi.bbox as [number,number,number,number];
    if (typeof obs?.aoi?.lat === "number" && typeof obs?.aoi?.lon === "number") {
      return [obs.aoi.lon-0.5, obs.aoi.lat-0.5, obs.aoi.lon+0.5, obs.aoi.lat+0.5];
    }
    return null;
  };

  const SAR_OPACITY = 0.65;

  const isValidBbox = (b: [number,number,number,number] | null): b is [number,number,number,number] => {
    if (!b || b.length !== 4) return false;
    const [w,s,e,n] = b;
    if (!Number.isFinite(w) || !Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(n)) return false;
    if (w < -180 || w > 180 || e < -180 || e > 180 || s < -90 || s > 90 || n < -90 || n > 90) return false;
    if (Math.abs(e - w) > 180 || Math.abs(n - s) > 60) return false; // guard against giant invalid rectangle
    if (w > e) return false; // antimeridian crossing - handle separately
    return true;
  };

  const addSARLayers = useCallback(() => {
    const map = mapRef.current as any;
    if (!map) return;
    const reqId = ++layerRequestId.current;

    // Remove existing SAR layers (keep basemap)
    try { if (map.getLayer("current-sar")) map.removeLayer("current-sar"); } catch {}
    try { if (map.getSource("current-sar")) map.removeSource("current-sar"); } catch {}
    try { if (map.getLayer("previous-sar")) map.removeLayer("previous-sar"); } catch {}
    try { if (map.getSource("previous-sar")) map.removeSource("previous-sar"); } catch {}
    try { if (map.getLayer("current-footprint")) map.removeLayer("current-footprint"); } catch {}
    try { if (map.getSource("current-footprint")) map.removeSource("current-footprint"); } catch {}
    try { if (map.getLayer("previous-footprint")) map.removeLayer("previous-footprint"); } catch {}
    try { if (map.getSource("previous-footprint")) map.removeSource("previous-footprint"); } catch {}
    try { if (map.getLayer("split-mask")) map.removeLayer("split-mask"); } catch {}
    try { if (map.getSource("split-mask")) map.removeSource("split-mask"); } catch {}
    try { if (map.getLayer("anomaly-marker")) map.removeLayer("anomaly-marker"); } catch {}
    try { if (map.getSource("anomaly-marker")) map.removeSource("anomaly-marker"); } catch {}

    // Layer order: basemap (already) -> monitoring region (added separately, ensure below SAR) -> SAR overlay -> footprint -> anomaly
    const isSafeImageUrl = (url: string) => {
      if (!url) return false;
      if (url.startsWith("data:")) return true;
      if (url.startsWith("/")) return true; // local synthetic DEMO
      // Auth-required Copernicus URLs will fail CORS as image source; skip to keep basemap visible
      if (url.includes("datahub.creodias.eu") || url.includes("creodias") || url.includes("/odata/")) return false;
      // Allow http/https that are not auth-required (Esri tiles are raster source, not image)
      return url.startsWith("http");
    };

    // Add current SAR overlay using true footprint/AOI, semi-transparent so basemap remains visible
    if (currentObservation?.previewUrl) {
      const url = currentObservation.previewUrl;
      if (!isSafeImageUrl(url)) {
        console.warn("LiveWorldMap skipping current SAR overlay with auth-required URL (would block basemap):", url.slice(0, 100));
      } else {
        const bbox = getFootprintBbox(currentObservation);
        if (bbox && isValidBbox(bbox) && layerRequestId.current === reqId) {
          try {
            map.addSource("current-sar", {
              type: "image",
              url: url,
              coordinates: [
                [bbox[0], bbox[3]], // west,north
                [bbox[2], bbox[3]], // east,north
                [bbox[2], bbox[1]], // east,south
                [bbox[0], bbox[1]], // west,south
              ],
            });
            map.addLayer({
              id: "current-sar",
              type: "raster",
              source: "current-sar",
              paint: {
                "raster-opacity": viewMode === "before" && previousObservation?.previewUrl ? 0 : SAR_OPACITY,
              },
            });
            currentLayerId.current = "current-sar";
            // Scene footprint outline (prefer actual geometry if available)
            const geom = (currentObservation as any).footprint?.geometry;
            if (geom && geom.type === "Polygon") {
              map.addSource("current-footprint", { type: "geojson", data: { type: "Feature", geometry: geom, properties: {} } as any });
            } else {
              map.addSource("current-footprint", {
                type: "geojson",
                data: {
                  type: "Feature",
                  geometry: { type: "Polygon", coordinates: [[[bbox[0], bbox[1]],[bbox[2], bbox[1]],[bbox[2], bbox[3]],[bbox[0], bbox[3]],[bbox[0], bbox[1]]]] },
                  properties: {},
                } as any,
              });
            }
            map.addLayer({
              id: "current-footprint",
              type: "line",
              source: "current-footprint",
              paint: { "line-color": "#22d3ee", "line-width": 1.5, "line-opacity": 0.9 },
            });
          } catch (e) { console.warn("current-sar add failed", e); }
        } else if (bbox && !isValidBbox(bbox)) {
          console.warn("current bbox invalid or antimeridian, skipping overlay", bbox);
        }
      }
    }

    // Add previous SAR overlay (same safe check)
    if (previousObservation?.previewUrl) {
      const purl = previousObservation.previewUrl;
      if (!isSafeImageUrl(purl)) {
        console.warn("LiveWorldMap skipping previous SAR overlay with auth-required URL:", purl.slice(0, 100));
      } else {
        const bbox = getFootprintBbox(previousObservation);
        if (bbox && isValidBbox(bbox) && layerRequestId.current === reqId) {
          try {
            map.addSource("previous-sar", {
              type: "image",
              url: purl,
              coordinates: [
                [bbox[0], bbox[3]],
                [bbox[2], bbox[3]],
                [bbox[2], bbox[1]],
                [bbox[0], bbox[1]],
              ],
            });
            map.addLayer({
              id: "previous-sar",
              type: "raster",
              source: "previous-sar",
              paint: {
                "raster-opacity": viewMode === "after" ? 0 : SAR_OPACITY,
              },
            });
            previousLayerId.current = "previous-sar";
            const geom = (previousObservation as any).footprint?.geometry;
            if (geom && geom.type === "Polygon") {
              map.addSource("previous-footprint", { type: "geojson", data: { type: "Feature", geometry: geom, properties: {} } as any });
            } else {
              map.addSource("previous-footprint", {
                type: "geojson",
                data: {
                  type: "Feature",
                  geometry: { type: "Polygon", coordinates: [[[bbox[0], bbox[1]],[bbox[2], bbox[1]],[bbox[2], bbox[3]],[bbox[0], bbox[3]],[bbox[0], bbox[1]]]] },
                  properties: {},
                } as any,
              });
            }
            map.addLayer({
              id: "previous-footprint",
              type: "line",
              source: "previous-footprint",
              paint: { "line-color": "#f59e0b", "line-width": 1.2, "line-opacity": 0.85, "line-dasharray": [2,2] },
            });
          } catch (e) { console.warn("previous-sar add failed", e); }
        }
      }
    }

    // Anomaly marker at investigation coordinates (obvious but not oversized)
    const anomalyLat = (currentObservation as any)?.aoi?.lat ?? monitoringRegion.center.lat;
    const anomalyLon = (currentObservation as any)?.aoi?.lon ?? monitoringRegion.center.lon;
    if (typeof anomalyLat === "number" && typeof anomalyLon === "number") {
      try {
        map.addSource("anomaly-marker", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "Point", coordinates: [anomalyLon, anomalyLat] },
            properties: {},
          } as any,
        });
        map.addLayer({
          id: "anomaly-marker",
          type: "circle",
          source: "anomaly-marker",
          paint: {
            "circle-radius": 5,
            "circle-color": "#f59e0b",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1.5,
            "circle-opacity": 0.9,
          },
        });
      } catch {}
    }
  }, [currentObservation, previousObservation, viewMode, splitPosition, monitoringRegion]);

  const addMonitoringRegionPolygon = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getSource("monitoring-region")) {
      try { map.removeLayer("monitoring-region-fill"); } catch {}
      try { map.removeLayer("monitoring-region-border"); } catch {}
      try { map.removeSource("monitoring-region"); } catch {}
    }

    map.addSource("monitoring-region", {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [monitoringRegion.bbox[0], monitoringRegion.bbox[1]],
            [monitoringRegion.bbox[2], monitoringRegion.bbox[1]],
            [monitoringRegion.bbox[2], monitoringRegion.bbox[3]],
            [monitoringRegion.bbox[0], monitoringRegion.bbox[3]],
            [monitoringRegion.bbox[0], monitoringRegion.bbox[1]],
          ]],
        },
        properties: { name: monitoringRegion.name },
      } as any,
    });

    map.addLayer({
      id: "monitoring-region-fill",
      type: "fill",
      source: "monitoring-region",
      paint: {
        "fill-color": "#0ea5e9",
        "fill-opacity": 0.1,
        "fill-outline-color": "#0ea5e9",
      },
    });

    map.addLayer({
      id: "monitoring-region-border",
      type: "line",
      source: "monitoring-region",
      paint: {
        "line-color": "#0ea5e9",
        "line-width": 2,
        "line-dasharray": [4, 4],
      },
    });
    // Ensure SAR overlay stays above monitoring region (layer order: basemap -> region -> SAR -> footprint -> anomaly)
    try { if (map.getLayer("current-sar")) map.moveLayer("current-sar"); } catch {}
    try { if (map.getLayer("current-footprint")) map.moveLayer("current-footprint"); } catch {}
    try { if (map.getLayer("previous-sar")) map.moveLayer("previous-sar"); } catch {}
    try { if (map.getLayer("previous-footprint")) map.moveLayer("previous-footprint"); } catch {}
    try { if (map.getLayer("anomaly-marker")) map.moveLayer("anomaly-marker"); } catch {}
  }, [monitoringRegion]);

  // Initialize map once - WORLD context first, do not wait for STAC
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    // Ensure container has real height before creating map (prevents blank canvas)
    const container = mapContainerRef.current!;
    if (container.clientHeight < 50) {
      console.warn("LiveWorldMap container height is 0, deferring map init");
      const t = setTimeout(() => {
        if (mapRef.current) return;
        // retry
        const evt = new Event("resize");
        window.dispatchEvent(evt);
      }, 100);
      return () => clearTimeout(t);
    }

    const map = new maplibregl.Map({
      container: container,
      style: MAP_STYLE as any,
      center: [0, 20],
      zoom: 1.2,
      pitch: 0,
      bearing: 0,
      antialias: true,
      preserveDrawingBuffer: true,
    });

    (map as any).addControl(new maplibregl.NavigationControl(), "top-right");
    (map as any).addControl(new maplibregl.ScaleControl(), "bottom-left");
    (map as any).addControl(new maplibregl.FullscreenControl(), "top-right");

    // Diagnostics: log style/sources/layers and tile errors
    map.on("error", (e: any) => {
      const err = e?.error || e;
      // Only warn for basemap issues, not for expected SAR auth failures (datahub) which are handled separately
      if (err?.url && err.url.includes("datahub.creodias.eu")) return;
      console.warn("LiveWorldMap map error", err?.message || err, err?.status || "");
      if (err?.url) console.warn("Tile failed:", err.url, err.status);
    });
    map.on("sourcedata", (e: any) => {
      if ((e?.sourceId === "esri-satellite" || e?.sourceId === "satellite") && e?.isSourceLoaded) {
        // eslint-disable-next-line no-console
        console.log("LiveWorldMap satellite source loaded", e.sourceId);
      }
    });

    map.on("load", () => {
      console.log("LiveWorldMap map loaded, style sources:", Object.keys((map as any).getStyle()?.sources || {}), "layers:", (map as any).getStyle()?.layers?.map((l:any)=>l.id));
      // Ensure Esri raster source/layer is actually present and visible (explicit add if MAP_STYLE failed)
      // Handle both legacy "satellite" and new "esri-satellite" IDs
      try {
        const hasEsri = !!map.getSource("esri-satellite");
        const hasLegacy = !!map.getSource("satellite");
        if (!hasEsri && !hasLegacy) {
          console.warn("LiveWorldMap satellite source missing, adding Esri explicitly");
          map.addSource("esri-satellite", {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            attribution: "© Esri, Maxar, Earthstar Geographics",
          } as any);
          map.addLayer({
            id: "esri-satellite-basemap",
            type: "raster",
            source: "esri-satellite",
            paint: { "raster-opacity": 1 },
          } as any);
        } else if (hasEsri && !map.getLayer("esri-satellite-basemap")) {
          map.addLayer({
            id: "esri-satellite-basemap",
            type: "raster",
            source: "esri-satellite",
            paint: { "raster-opacity": 1 },
          } as any);
        } else if (hasLegacy && !map.getLayer("satellite-basemap")) {
          map.addLayer({
            id: "satellite-basemap",
            type: "raster",
            source: "satellite",
            minzoom: 0,
            maxzoom: 19,
          } as any);
        }
        // Ensure basemap is at bottom
        try { if (map.getLayer("esri-satellite-basemap")) map.moveLayer("esri-satellite-basemap"); } catch {}
        try { if (map.getLayer("satellite-basemap")) map.moveLayer("satellite-basemap"); } catch {}
        // Ensure background is at very bottom
        try { if (map.getLayer("background")) map.moveLayer("background"); } catch {}
        console.log("LiveWorldMap basemap verified, sources:", Object.keys((map as any).getStyle()?.sources || {}), "layers:", (map as any).getStyle()?.layers?.map((l:any)=>l.id));
      } catch (err) {
        console.warn("LiveWorldMap basemap explicit add failed", err);
      }
      setMapLoaded(true);
      // Resize to ensure canvas fills container (fixes blank when parent height animates)
      setTimeout(() => { try { map.resize(); } catch {} }, 50);
      // After global basemap visible, fit to monitoring region with padding to show coastline/ocean context
      try {
        map.fitBounds(
          [
            [monitoringRegion.bbox[0], monitoringRegion.bbox[1]],
            [monitoringRegion.bbox[2], monitoringRegion.bbox[3]],
          ],
          { padding: 80, duration: 800, maxZoom: 6 }
        );
      } catch {}
    });

    // Ensure map resizes when container becomes visible
    const ro = new ResizeObserver(() => { try { map.resize(); } catch {} });
    try { ro.observe(container); } catch {}

    mapRef.current = map as any;

    return () => {
      try { ro.disconnect(); } catch {}
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After map loaded, add layers in correct order: monitoring region -> SAR overlay -> footprint -> anomaly (async, basemap already visible)
  useEffect(() => {
    if (!mapLoaded) return;
    const t = setTimeout(() => {
      addMonitoringRegionPolygon();
      // Defer SAR so basemap + region are visible first, then overlay
      setTimeout(() => addSARLayers(), 100);
    }, 0);
    return () => clearTimeout(t);
  }, [mapLoaded, addSARLayers, addMonitoringRegionPolygon]);

  // Update SAR layers when observations or viewMode change (async, without blocking map interaction)
  // Keep map camera stable for BEFORE/AFTER/SPLIT (do not change camera)
  useEffect(() => {
    if (!mapLoaded) return;
    const t = setTimeout(() => addSARLayers(), 0);
    return () => clearTimeout(t);
  }, [currentObservation, previousObservation, viewMode, mapLoaded, addSARLayers]);

  // Update monitoring region polygon when region changes without recreating map (preserve pan/zoom)
  useEffect(() => {
    if (!mapLoaded) return;
    addMonitoringRegionPolygon();
    // Do not auto-fit on region change unless user clicks Fit — preserves WORLD/REGION context
  }, [monitoringRegion, mapLoaded, addMonitoringRegionPolygon]);

  const handleRegionChange = (regionId: string) => {
    const region = SEA_PRESETS.find(r => r.id === regionId);
    if (region && onRegionChange) {
      setSelectedRegion(region.id);
      onRegionChange(region.id);
    }
    setShowRegionSelector(false);
  };

  const handleSplitMove = (e: MouseEvent) => {
    if (!splitDividerRef.current) return;
    const rect = splitDividerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSplitPosition(percent);
  };

  const handleSplitEnd = () => {
    window.removeEventListener("mousemove", handleSplitMove as any);
    window.removeEventListener("mouseup", handleSplitEnd);
  };

  // Sync view mode with layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer("current-sar")) {
      map.setPaintProperty("current-sar", "raster-opacity", viewMode === "before" ? 0 : 1);
    }
    if (map.getLayer("previous-sar")) {
      map.setPaintProperty("previous-sar", "raster-opacity", viewMode === "after" ? 0 : 1);
    }
  }, [viewMode]);

  const handleRegionSelect = (regionId: string) => {
    handleRegionChange(regionId);
  };

  return (
    <div className="relative w-full h-full bg-slate-950">
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* Region Selector Dropdown */}
      <div className="absolute top-4 left-4 z-20">
        <div className="relative">
          <Button
            variant="outline"
            className="gap-2 px-3 py-2 text-sm bg-slate-900/80 backdrop-blur border-white/10"
            onClick={() => setShowRegionSelector(!showRegionSelector)}
          >
            <span className="text-cyan-300">🌍</span>
            <span className="font-medium">{monitoringRegion.name}</span>
            <span className="text-[10px]">▼</span>
          </Button>

          {showRegionSelector && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-slate-900/95 backdrop-blur border border-white/10 rounded-lg shadow-lg overflow-hidden z-30">
              {SEA_PRESETS.map(region => (
                <button
                  key={region.id}
                  onClick={() => handleRegionSelect(region.id)}
                  className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                    selectedRegion === region.id
                      ? "bg-cyan-500/20 text-cyan-300"
                      : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <div className="font-medium">{region.name}</div>
                  <div className="text-[10px] text-slate-500">
                    {region.center.lat.toFixed(1)}°N, {region.center.lon.toFixed(1)}°E
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Loading indicator (small, not blocking) */}
      {mapLoaded && currentObservation?.previewUrl && (
        <div className="absolute top-4 right-4 z-20 bg-slate-900/80 backdrop-blur border border-white/10 rounded-full px-3 py-1 text-[11px] text-cyan-300">
          Sentinel-1 overlay: {currentObservation ? "loaded" : "loading..."}
        </div>
      )}
      {!mapLoaded && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 bg-slate-900/80 backdrop-blur border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300">
          Loading world map...
        </div>
      )}

      {/* Map Controls */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
        <div className="flex flex-col gap-1 bg-slate-900/80 backdrop-blur border border-white/10 rounded-lg p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={() => {
              const map = mapRef.current as any;
              if (!map) return;
              // Prefer actual footprint for investigation area, fallback to monitoring bbox, keep padding to show coastline
              const bbox = (currentObservation as any)?.footprint?.bbox || monitoringRegion.bbox;
              if (Array.isArray(bbox) && bbox.length===4) {
                map.fitBounds([[bbox[0], bbox[1]],[bbox[2], bbox[3]]], { padding: 80, duration: 900, maxZoom: 7 });
              } else {
                map.fitBounds([[monitoringRegion.bbox[0], monitoringRegion.bbox[1]],[monitoringRegion.bbox[2], monitoringRegion.bbox[3]]], { padding: 60, duration: 900 });
              }
            }}
          >
            🌍 Fit Investigation Area
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={() => {
              const map = mapRef.current as any;
              if (map) map.fitBounds([[-180, -85],[180, 85]], { padding: 20, duration: 900 });
            }}
          >
            🌍 Fit World
          </Button>
        </div>

        <div className="flex flex-col gap-1 bg-slate-900/80 backdrop-blur border border-white/10 rounded-lg p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={() => setMapStyle("satellite")}
          >
            🛰 Satellite
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={() => setMapStyle("ocean")}
          >
            🌊 Ocean
          </Button>
        </div>

        {/* View Mode Controls */}
        <div className="flex gap-1 bg-slate-900/80 backdrop-blur border border-white/10 rounded-lg p-1">
          {(["before", "after", "split"] as const).map(mode => (
            <Button
              key={mode}
              variant={viewMode === mode ? "default" : "ghost"}
              size="sm"
              className="px-3 py-1.5 text-xs"
              onClick={() => onViewModeChange(mode)}
            >
              {mode.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {/* Split View Divider */}
      {viewMode === "split" && (
        <div
          ref={splitDividerRef}
          className="absolute inset-y-0 w-1 bg-emerald-500/50 cursor-col-resize z-10 flex items-center justify-center"
          onMouseDown={(e) => {
            e.preventDefault();
            window.addEventListener("mousemove", handleSplitMove as any);
            window.addEventListener("mouseup", handleSplitEnd);
          }}
          style={{ left: `${splitPosition}%` }}
        >
          <div className="h-8 w-px bg-emerald-500" />
          <div className="absolute -left-16 top-1/2 -translate-y-1/2 text-[10px] text-emerald-300 font-mono">
            {Math.round(splitPosition)}%
          </div>
        </div>
      )}

      {/* Banner for missing previous - clearly instead of duplicating */}
      {(viewMode === "before" || viewMode === "split") && !previousObservation?.previewUrl && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-amber-500/20 border border-amber-500/30 rounded-lg px-3 py-1.5 text-xs text-amber-300 backdrop-blur">
          Previous scene unavailable — temporal comparison not possible. Showing current only.
        </div>
      )}

      {/* Metadata Panel */}
      <div className="absolute bottom-4 left-4 z-20 max-w-xs">
        <div className="bg-slate-900/90 backdrop-blur border border-white/10 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-widest font-semibold text-slate-400">{currentObservation?.mode === "DEMO" ? "DEMO/SIMULATED" : "LIVE METADATA"}</span>
            <Badge variant={currentObservation ? "success" : "outline"} className={`text-[10px] ${currentObservation?.mode === "DEMO" ? "bg-sky-500/20 text-sky-300 border-sky-500/30" : ""}`}>
              {currentObservation ? (currentObservation.mode === "DEMO" ? "DEMO/SIMULATED" : "LIVE") : "NO DATA"}
            </Badge>
          </div>

          {currentObservation && (
            <div className="space-y-1 text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Satellite</span>
                <span className="font-mono text-cyan-300">{currentObservation.satellite}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Scene</span>
                <span className="font-mono text-cyan-300 truncate max-w-[200px]">{currentObservation.productId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Acquired</span>
                <span className="font-mono text-cyan-300">{formatUtcTime(currentObservation.acquiredAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Provider</span>
                <span className="font-mono text-cyan-300 text-[10px] truncate max-w-[200px]">{currentObservation.provider}</span>
              </div>
              {(currentObservation as any)?.footprint?.bbox && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">Footprint</span>
                  <span className="font-mono text-slate-400 truncate max-w-[180px]">{(currentObservation as any).footprint.bbox.map((n:number)=>n.toFixed(2)).join(", ")}</span>
                </div>
              )}
            </div>
          )}

          {previousObservation ? (
            <div className="pt-2 border-t border-white/10 space-y-1 text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Previous</span>
                <span className="font-mono text-amber-300 truncate max-w-[180px]">{previousObservation.productId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Acquired</span>
                <span className="font-mono text-amber-300">{formatUtcTime(previousObservation.acquiredAt)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>Δ time</span>
                <span className="font-mono text-amber-300">
                  {Math.round((new Date(currentObservation?.acquiredAt || 0).getTime() - new Date(previousObservation.acquiredAt).getTime()) / (1000 * 60 * 60 * 24))}d
                </span>
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-white/10 text-[11px] text-slate-500">
              Previous unavailable
            </div>
          )}
        </div>
      </div>

      {/* View Mode Toggle - Mobile */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 lg:hidden">
        <div className="flex gap-1 bg-slate-900/90 backdrop-blur border border-white/10 rounded-lg p-1">
          {(["before", "after", "split"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                viewMode === mode
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}