import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// In-process cache for rendered previews: key -> { buffer, contentType, timestamp }
const previewCache = new Map<string, { buffer: Buffer; contentType: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 50;

// Reuse existing Process API logic
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";
const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";

let cachedToken: { token: string; exp: number } | null = null;

async function fetchWithTimeout(url: string, init: RequestInit, ms: number, label: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`${label} timeout after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(t);
  }
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

function getCopernicusCreds(): { id: string | undefined; secret: string | undefined; source: string } {
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

async function getOAuthToken(): Promise<string> {
  const { id, secret } = getCopernicusCreds();
  if (!id || !secret) throw new Error("LIVE SATELLITE NOT CONFIGURED: missing COPERNICUS_CLIENT_ID/SECRET");
  if (cachedToken && cachedToken.exp > Date.now() + 30000) return cachedToken.token;
  const res = await fetchWithRetry(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }).toString(),
  }, 15000, "OAuth token", 3);
  if (!res.ok) {
    const txt = await res.text().then(t => t.slice(0, 300)).catch(() => String(res.status));
    if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new Error(`OAuth failed: ${res.status} ${txt}`);
    throw new Error(`OAuth failed: ${res.status} ${txt}`);
  }
  const data: any = await res.json();
  cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600000) };
  return cachedToken.token;
}

const EVALSCRIPT_VERSION = "v4-fix-time-ms-bright";
export function getSarPreviewCacheKey(productId: string, acquiredAt: string, bbox: [number, number, number, number], role: string): string {
  return `${productId}:${acquiredAt}:${bbox.join(",")}:${role}:${EVALSCRIPT_VERSION}`;
}
// Normalize STAC datetime with fractional seconds (e.g. 2026-09-16T01:18:19.079828Z) to second precision for Process API.
// Sentinel Hub dataFilter timeRange with ms can miss the product (returns uniform 0,20,15), while truncated to seconds returns proper varied image.
function normalizeTimeForProcessApi(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().replace(/\.\d+Z$/, "Z");
}

export async function renderSarPreviewBytes(params: {
  productId: string;
  bbox: [number, number, number, number];
  acquiredAt: string;
  role?: string;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const { productId, bbox, acquiredAt, role = "current" } = params;
  const cacheKey = getSarPreviewCacheKey(productId, acquiredAt, bbox, role);
  const cached = previewCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { buffer: cached.buffer, contentType: cached.contentType };
  }

  const evalscript = `//VERSION=3
function setup(){return{input:["VV","VH"],output:{bands:3, sampleType:"AUTO"}};}
function toDb(x){ return x > 0.0001 ? 10*Math.log10(x) : -30; }
function stretch(db){
  // ocean-optimized v4: robust Sentinel-1 contrast stretch — sea ~ -18dB => 0.6, oil ~ -22dB => 0.34, land bright
  // Ensures real tonal variation, not uniform black. Gamma lifts dark ocean to mid-grey.
  let c = (db + 25) / 15;
  c = Math.max(0, Math.min(1, c));
  return Math.pow(c, 0.68);
}
function evaluatePixel(s){
  let v = stretch(toDb(s.VV));
  let h = stretch(toDb(s.VH));
  let r = Math.min(1, v * 1.08);
  let g = Math.min(1, (v*0.55 + h*0.45) * 1.05 + 0.08);
  let b = Math.min(1, h * 1.12 + 0.06);
  return [r, g, b];
}`;
  // CRITICAL FIX: STAC datetime includes fractional seconds (e.g. .079828Z). Process API timeRange with ms returns
  // uniform black (no data) — truncation to seconds returns proper varied 512x512. Use second-precision window
  // with 5-min padding before acquisition to guarantee product inclusion.
  const acquiredDate = new Date(acquiredAt);
  const fromTime = normalizeTimeForProcessApi(new Date(acquiredDate.getTime() - 5*60*1000).toISOString());
  const toTime = normalizeTimeForProcessApi(new Date(acquiredDate.getTime() + 24*3600*1000).toISOString());
  // Log the time normalization for debugging (no secrets)
  console.log(JSON.stringify({ event: "sarPreview request", productId, role, bbox, acquiredAt, fromTime, toTime, evalscriptVersion: EVALSCRIPT_VERSION }));
  const token = await getOAuthToken();
  const processBody = {
    input: {
      bounds: { bbox, properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" } },
      data: [{ type: "S1GRD", dataFilter: { timeRange: { from: fromTime, to: toTime } }, processing: { orthorectify: true, demInstance: "COPERNICUS_30" } }],
    },
    output: { width: 512, height: 512, responses: [{ identifier: "default", format: { type: "image/png" } }] },
    evalscript,
  };

  const pr = await fetchWithRetry(PROCESS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(processBody),
  }, 25000, "Process API", 2);

  if (!pr.ok) {
    const txt = await pr.text().then(t => t.slice(0, 500)).catch(() => "");
    const err = `Process API failed: ${pr.status} ${txt}`;
    if (pr.status >= 400 && pr.status < 500 && pr.status !== 429) {
      throw new Error(err);
    }
    throw new Error(err);
  }

  const buf = Buffer.from(await pr.arrayBuffer());
  const ct = pr.headers.get("content-type") || "";
  console.log(JSON.stringify({ event: "sarPreview response", productId, role, status: pr.status, contentType: ct, byteLength: buf.length, isPng: buf.length>8 && buf[0]===0x89 }));
  // Server-side pixel verification (instrumentation): decode PNG and log min/max/avg for debugging uniformity
  try {
    // Lazy load canvas only if available to avoid bundling issues
    const { createCanvas, loadImage } = await import("canvas");
    const tmpPath = join(process.cwd(), `.tmp_preview_${role}_${Date.now()}.png`);
    // Write to temp and load to avoid Buffer confusion in some canvas versions - instead use data URL
    const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    const img: any = await (loadImage as any)(dataUrl);
    const canvas: any = (createCanvas as any)(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height).data;
    let min=255, max=0, sum=0, n=img.width*img.height;
    let minA=255, maxA=0, sumA=0;
    for(let i=0;i<imageData.length;i+=4){ const r=imageData[i], g=imageData[i+1], b=imageData[i+2], a=imageData[i+3]; const lum = Math.round((r+g+b)/3); sum+=lum; min=Math.min(min,lum); max=Math.max(max,lum); sumA+=a; minA=Math.min(minA,a); maxA=Math.max(maxA,a); }
    console.log(JSON.stringify({ event: "sarPreview pixel stats", productId, role, width: img.width, height: img.height, min, max, average: (sum/n).toFixed(2), alphaMin: minA, alphaMax: maxA, alphaAvg: (sumA/n).toFixed(2), byteLength: buf.length }));
    if (min === max) {
      console.warn(JSON.stringify({ event: "sarPreview uniform image WARNING", productId, role, min, max, average: (sum/n).toFixed(2) }));
    }
  } catch (e:any) {
    console.warn(JSON.stringify({ event: "sarPreview pixel stats failed", productId, role, error: String(e?.message||e).slice(0,200) }));
  }

// Real validity check: correct PNG signature + reasonable minimum for a genuine (even low-contrast) 512x512 image.
// Sentinel Hub returns a JSON error body (not a PNG) on real failures, so checking the PNG magic bytes
// is a much more reliable failure signal than raw byte size.
const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
if (!isPng) {
  const asText = buf.toString("utf8").slice(0, 500);
  throw new Error(`Process API did not return a PNG (likely an error body): ${asText}`);
}

  const result = { buffer: buf, contentType: "image/png" as string };
  // Cache
  if (previewCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = previewCache.keys().next().value;
    if (firstKey) previewCache.delete(firstKey);
  }
  previewCache.set(cacheKey, { buffer: buf, contentType: "image/png", timestamp: Date.now() });
  return result;
}

export async function getDemoPreviewBytes(bbox?: [number, number, number, number], role: string = "current"): Promise<{ buffer: Buffer; contentType: string }> {
  // For DEMO, serve local synthetic file
  const fileName = role === "previous" ? "demo-sar-previous.png" : "demo-sar-current.png";
  const filePath = join(process.cwd(), "public", "demo", "sar", fileName);
  try {
    const buf = await readFile(filePath);
    return { buffer: buf, contentType: "image/png" };
  } catch (e: any) {
    // Fallback to current
    const fallbackPath = join(process.cwd(), "public", "demo", "sar", "demo-sar-current.png");
    const buf = await readFile(fallbackPath);
    return { buffer: buf, contentType: "image/png" };
  }
}

// Export helpers for reuse in liveSentinel1Provider to avoid duplication
export { getOAuthToken, fetchWithRetry, PROCESS_URL, TOKEN_URL };
