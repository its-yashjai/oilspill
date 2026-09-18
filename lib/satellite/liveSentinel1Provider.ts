import { randomUUID } from "node:crypto";
import type { SatelliteProvider, SatelliteObservation, AcquireInput } from "./types";
import { renderSarPreviewBytes, getSarPreviewCacheKey } from "./sarPreview";

const STAC_URL = "https://stac.dataspace.copernicus.eu/v1/search";
const COLLECTION = "sentinel-1-grd";

// Re-export for sarPreview route to avoid duplication (kept for backward compat)
export { renderSarPreviewBytes };

// Canonical env names: COPERNICUS_CLIENT_ID/SECRET (SENTINEL_HUB_* deprecated but still fallback for compat)
function getCopernicusCreds(): { id: string | undefined; secret: string | undefined; source: "copernicus" | "sentinel_hub" | "none" } {
  const idCanon = process.env.COPERNICUS_CLIENT_ID;
  const secCanon = process.env.COPERNICUS_CLIENT_SECRET;
  if (idCanon && secCanon) return { id: idCanon, secret: secCanon, source: "copernicus" };
  const idAlias = process.env.SENTINEL_HUB_CLIENT_ID;
  const secAlias = process.env.SENTINEL_HUB_CLIENT_SECRET;
  if (idAlias && secAlias) return { id: idAlias, secret: secAlias, source: "sentinel_hub" };
  if (idCanon || secCanon || idAlias || secAlias) {
    return { id: idCanon || idAlias, secret: secCanon || secAlias, source: idCanon ? "copernicus" : "sentinel_hub" };
  }
  return { id: undefined, secret: undefined, source: "none" };
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number, label: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`${label} timeout after ${ms}ms`);
    throw e;
  } finally { clearTimeout(t); }
}

function isTransientStatus(status: number) {
  return status === 429 || (status >= 500 && status < 600);
}
function isTransientError(e: any) {
  const msg = String(e?.message || "").toLowerCase();
  if (msg.includes("timeout after") || msg.includes("abort") || msg.includes("network") || msg.includes("fetch failed") || msg.includes("econn") || msg.includes("etimedout") || msg.includes("enotfound")) return true;
  return false;
}
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url: string, init: RequestInit, ms: number, label: string, maxAttempts = 3): Promise<Response> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, ms, label);
      if (res.ok) return res;
      if (isTransientStatus(res.status) && attempt < maxAttempts) {
        try { await res.text(); } catch {}
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1) * 0.15 + Math.random() * 100, 1500);
        console.warn(JSON.stringify({ provider: "liveSentinel1", event: "retry", label, attempt, status: res.status, backoffMs: Math.round(backoff) }));
        await sleep(Math.round(backoff));
        continue;
      }
      return res;
    } catch (e: any) {
      lastError = e;
      const transient = isTransientError(e);
      if (String(e?.message || "").includes("LIVE SATELLITE NOT CONFIGURED")) throw e;
      if (!transient || attempt >= maxAttempts) throw e;
      const backoff = Math.min(200 * Math.pow(2, attempt - 1) + Math.random() * 100, 1500);
      console.warn(JSON.stringify({ provider: "liveSentinel1", event: "retry", label, attempt, error: String(e?.message || e).slice(0, 200), backoffMs: Math.round(backoff) }));
      await sleep(Math.round(backoff));
    }
  }
  throw lastError;
}

export class LiveSentinel1Provider implements SatelliteProvider {
  mode = "LIVE" as const;
  isConfigured() { const { id, secret } = getCopernicusCreds(); return !!(id && secret); }
  configStatus() {
    const { id, secret } = getCopernicusCreds();
    const missing: string[] = [];
    if (!id) missing.push("COPERNICUS_CLIENT_ID");
    if (!secret) missing.push("COPERNICUS_CLIENT_SECRET");
    return { configured: missing.length===0, missing, source: getCopernicusCreds().source } as { configured: boolean; missing: string[]; source?: string };
  }

  // Helper to build observation from STAC feature with footprint and same-origin previewUrl
  // Preview rendering is deferred to /api/incidents/[id]/sar-preview/[role] which reuses renderSarPreviewBytes
  private async buildObservationFromFeature(
    feature: any,
    lat: number,
    lon: number,
    fallbackBbox: [number, number, number, number],
    incidentId?: string,
    role: "current" | "previous" = "current"
  ): Promise<SatelliteObservation> {
    const props: any = feature.properties || {};
    const productId: string = feature.id || props.productIdentifier || `S1-${randomUUID()}`;
    const acquiredAt: string = props.datetime || props.start_datetime || props.updated || new Date().toISOString();
    const platform: string = props.platform || props["sat:platform"] || "Sentinel-1";
    const stacBbox = Array.isArray(feature.bbox) && feature.bbox.length===4 ? feature.bbox as [number,number,number,number] : fallbackBbox;
    const geometry = feature.geometry || null;

    // Same-origin preview URL — browser will fetch from our server, which does OAuth + Process API server-side
    // Do NOT expose raw datahub asset URL or bearer token to browser
    let previewUrl: string | undefined;
    if (incidentId) {
      previewUrl = `/api/incidents/${incidentId}/sar-preview/${role}`;
    } else {
      // Fallback for callers without incidentId (should not happen for LIVE incidents, but keep for backward compat)
      // Use same-origin with placeholder — will be replaced when incident is created
      previewUrl = undefined;
    }

    return {
      observationId: `LIVE-${randomUUID()}`,
      mode: "LIVE",
      provider: "Copernicus Data Space Ecosystem / Sentinel Hub",
      satellite: platform,
      productId,
      sceneId: productId,
      acquiredAt,
      aoi: { lat, lon, bbox: stacBbox },
      previewUrl,
      attribution: "Copernicus Sentinel-1 — Data Space Ecosystem STAC + Sentinel Hub Process API",
      metadata: { stacId: feature.id, properties: props, bbox: stacBbox },
      footprint: { bbox: stacBbox, geometry },
    };
  }

  private async queryFeatures(bbox: [number,number,number,number], days: number, limit: number): Promise<any[]> {
    const now = new Date();
    const from = new Date(now.getTime() - days*24*3600*1000);
    const stacBody = {
      collections: [COLLECTION],
      bbox,
      datetime: `${from.toISOString()}/${now.toISOString()}`,
      limit,
      sortby: [{ field: "properties.datetime", direction: "desc" }],
    };
    try {
      const stacRes = await fetchWithRetry(STAC_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(stacBody) }, 30000, "STAC search", 3);
      if (!stacRes.ok) {
        if (stacRes.status >= 400 && stacRes.status < 500 && stacRes.status !== 429) return [];
        return [];
      }
      const stac = await stacRes.json();
      return stac.features || [];
    } catch (e:any) {
      console.warn(JSON.stringify({ provider:"liveSentinel1", event:"STAC search failed", bbox, days, error:String(e?.message||e).slice(0,200)}));
      return [];
    }
  }

  async acquirePair(input: AcquireInput): Promise<{ current: SatelliteObservation; previous: SatelliteObservation | null }> {
    if (!this.isConfigured()) throw new Error("LIVE SATELLITE NOT CONFIGURED: set COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET");
    const lat = input.lat ?? 19.2;
    const lon = input.lon ?? 64.5;
    const bbox: [number,number,number,number] = input.bbox || [lon-0.5, lat-0.5, lon+0.5, lat+0.5];
    const incidentId = input.incidentId;
    let features: any[] = [];
    for (const attempt of [
      { days: 7, box: bbox, limit: 10 },
      { days: 30, box: [lon-2, lat-2, lon+2, lat+2] as [number,number,number,number], limit: 10 },
      { days: 30, box: [60,15,70,25] as [number,number,number,number], limit: 6 },
    ]) {
      const batch = await this.queryFeatures(attempt.box, attempt.days, attempt.limit);
      if (batch.length) {
        const seen = new Set(features.map(f=>f.id));
        for (const f of batch) if (!seen.has(f.id)) { features.push(f); seen.add(f.id); }
        if (features.length >= 2) break;
      }
    }
    if (!features.length) throw new Error("LIVE acquisition failed: no Sentinel-1 scene found for AOI in last 30 days (tried 3 windows)");
    features.sort((a,b)=>{
      const da = new Date(a.properties?.datetime || a.properties?.start_datetime || 0).getTime();
      const db = new Date(b.properties?.datetime || b.properties?.start_datetime || 0).getTime();
      return db - da;
    });
    const deduped: any[] = [];
    const seenIds = new Set<string>();
    const seenTimes = new Set<string>();
    for (const f of features) {
      const pid = f.id || f.properties?.productIdentifier;
      const dt = f.properties?.datetime || f.properties?.start_datetime;
      if (pid && seenIds.has(pid)) continue;
      if (dt && seenTimes.has(dt)) continue;
      if (pid) seenIds.add(pid);
      if (dt) seenTimes.add(dt);
      deduped.push(f);
    }
    features = deduped;
    const currentFeature = features[0];
    const current = await this.buildObservationFromFeature(currentFeature, lat, lon, bbox, incidentId, "current");
    let previous: SatelliteObservation | null = null;
    if (features.length > 1) {
      const currentTime = new Date(current.acquiredAt).getTime();
      let candidate: any | null = null;
      let fallback: any | null = null;
      for (let i=1;i<features.length;i++) {
        const f = features[i];
        const pid = f.id || f.properties?.productIdentifier;
        const dtStr = f.properties?.datetime || f.properties?.start_datetime;
        if (!pid || !dtStr) continue;
        if (pid === current.productId) continue;
        const t = new Date(dtStr).getTime();
        if (!Number.isFinite(t) || t===currentTime) continue;
        if (!fallback) fallback = f;
        const diffH = (currentTime - t) / (3600*1000);
        if (diffH >= 24 && diffH <= 72) { candidate = f; break; }
        if (diffH > 72 && diffH <= 240) {
          if (!candidate) candidate = f;
        }
      }
      const chosen = candidate || fallback;
      if (chosen) {
        const pdt = chosen.properties?.datetime || chosen.properties?.start_datetime;
        const pid = chosen.id;
        if (pid !== current.productId && pdt !== current.acquiredAt) {
          previous = await this.buildObservationFromFeature(chosen, lat, lon, bbox, incidentId, "previous");
          if (previous.productId === current.productId || previous.acquiredAt === current.acquiredAt) {
            console.warn(JSON.stringify({ provider:"liveSentinel1", event:"previous duplicate filtered", current: current.productId, previous: previous.productId }));
            previous = null;
          }
        }
      }
    }
    return { current, previous };
  }

  async acquire(input: AcquireInput): Promise<SatelliteObservation> {
    const pair = await this.acquirePair(input);
    return pair.current;
  }
}
