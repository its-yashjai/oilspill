import { mockSearch } from "./mock";

export type MossQueryMetrics = {
  query: string;
  resultIds: string[];
  resultCount: number;
  latencyMs: number;
  timestamp: string;
  reason: string;
  mode: "real" | "fallback";
};

function isTransientMossError(e: any): boolean {
  const msg = String(e?.message||e||"").toLowerCase();
  if (msg.includes("timeout") || msg.includes("abort") || msg.includes("network") || msg.includes("fetch failed") || msg.includes("econn") ) return true;
  const status = (e as any)?.status ?? (e as any)?.statusCode;
  if (status === 429 || (typeof status === "number" && status >= 500 && status < 600)) return true;
  return false;
}
function isAuthMossError(e: any): boolean {
  const msg = String(e?.message||e||"").toLowerCase();
  if (msg.includes("unauthorized") || msg.includes("invalid") && msg.includes("key") ) return true;
  const status = (e as any)?.status ?? (e as any)?.statusCode;
  if (status === 401 || status === 403) return true;
  return false;
}
async function sleep(ms:number){ return new Promise(r=>setTimeout(r, ms)); }

export async function searchMoss(query: string, reason: string): Promise<{ results:any[]; metrics: MossQueryMetrics }>{
  const hasCreds = !!(process.env.MOSS_PROJECT_ID && process.env.MOSS_PROJECT_KEY);
  const t0 = performance.now();
  if(hasCreds){
    // Attempt real Moss via dynamic import with bounded exponential backoff for transient failures
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // @ts-ignore optional dep
        const moss = await import("@moss-dev/moss-core").catch(()=>null);
        if(moss && (moss as any).search){
          const r = await (moss as any).search({ query, index: process.env.MOSS_INDEX_NAME || "mission-room-knowledge" });
          const latencyMs = Number((performance.now()-t0).toFixed(2));
          const ids = (r.results||r||[]).map((x:any)=>x.id||x);
          return { results: r.results||r||[], metrics: { query, resultIds: ids, resultCount: ids.length, latencyMs, timestamp:new Date().toISOString(), reason, mode:"real" }};
        }
        break; // no search function -> fallback
      } catch(e:any){
        if (isAuthMossError(e)) {
          console.warn(JSON.stringify({ provider:"moss", event:"auth failure no retry", error:String(e?.message||e).slice(0,200)}));
          break;
        }
        if (!isTransientMossError(e) || attempt >= 3) {
          console.warn(JSON.stringify({ provider:"moss", event:"search failed fallback to mock", attempt, error:String(e?.message||e).slice(0,200)}));
          break;
        }
        const backoff = Math.min(200 * Math.pow(2, attempt-1) + Math.random()*100, 1200);
        console.warn(JSON.stringify({ provider:"moss", event:"retry", attempt, backoffMs: Math.round(backoff), error:String(e?.message||e).slice(0,200)}));
        await sleep(Math.round(backoff));
        continue;
      }
    }
  }
  const { results, latencyMs } = await mockSearch(query);
  return { results, metrics: { query, resultIds: results.map(r=>r.id), resultCount: results.length, latencyMs, timestamp:new Date().toISOString(), reason, mode:"fallback" } };
}
