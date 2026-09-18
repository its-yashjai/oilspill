import { NextRequest, NextResponse } from "next/server";
import { repo, serializeDates, withTransaction } from "@/lib/db/repo";
import { runDetection } from "@/lib/detection/engine";
import { withIdempotency, buildIdempotencyKey, getIdempotencyKeyFromRequest } from "@/lib/idempotency";
import { randomUUID } from "node:crypto";
import { agentRuns, contextVersions, timelineEvents, detectionRuns, incidentImages } from "@/lib/db/schema";

export async function GET(){
  const incidents = await repo.incidents.list();
  return NextResponse.json({ incidents: serializeDates(incidents) });
}

const REGION_BBOX: Record<string, [number,number,number,number]> = {
  "arabian sea": [64.0, 18.7, 65.0, 19.7],
  "bay of bengal": [82.0, 5.5, 92.0, 22.5],
  "red sea": [34.0, 12.5, 42.5, 28.0],
  "mediterranean": [10.0, 30.0, 36.0, 46.0],
  "mediterranean sea": [10.0, 30.0, 36.0, 46.0],
  "south china sea": [105.0, 0.0, 120.0, 25.0],
  "gulf of mexico": [-98.0, 18.0, -80.0, 31.0],
};

function resolveBboxFromRegion(region: string, provided?: unknown): [number,number,number,number] | undefined {
  if (Array.isArray(provided) && provided.length===4 && provided.every(n=>typeof n==="number")) return provided as [number,number,number,number];
  const key = region.toLowerCase().trim();
  if (REGION_BBOX[key]) return REGION_BBOX[key];
  return undefined;
}

function validateLocation(loc: unknown): { valid: boolean; error?: string; value?: { lat: number; lon: number; label: string; bbox?: unknown } } {
  if (loc === undefined || loc === null) return { valid: true, value: undefined };
  if (typeof loc !== "object" || Array.isArray(loc)) return { valid: false, error: "location must be an object with lat, lon" };
  const o = loc as Record<string, unknown>;
  const lat = o.lat;
  const lon = o.lon;
  if (typeof lat !== "number" || Number.isNaN(lat)) return { valid: false, error: "location.lat must be a number" };
  if (typeof lon !== "number" || Number.isNaN(lon)) return { valid: false, error: "location.lon must be a number" };
  if (lat < -90 || lat > 90) return { valid: false, error: "location.lat must be between -90 and 90" };
  if (lon < -180 || lon > 180) return { valid: false, error: "location.lon must be between -180 and 180" };
  if (o.label !== undefined && typeof o.label !== "string") return { valid: false, error: "location.label must be a string" };
  return { valid: true, value: { lat, lon, label: typeof o.label === "string" ? o.label : `${lat}, ${lon}`, bbox: o.bbox } };
}

export async function POST(req: NextRequest){
  const idemKey = getIdempotencyKeyFromRequest(req);
  const body = await req.json().catch(()=> ({}));

  const handler = async () => {
    // Validate location when provided; preserve default only when legitimately omitted
    if (body.location !== undefined) {
      const v = validateLocation(body.location);
      if (!v.valid) return NextResponse.json({ error: v.error }, { status: 400 });
    }
    const existingId = typeof body.id === "string" ? body.id : undefined;
    if (existingId) {
      const existing = await repo.incidents.getById(existingId);
      if (existing) {
        const state = await repo.incidents.getById(existingId).then(async () => {
          const detections = await repo.detectionRuns.listByIncident(existingId);
          return { incident: serializeDates(existing), detection: serializeDates(detections.at(-1) ?? null) };
        });
        return NextResponse.json({ incident: state.incident, detection: state.detection, idempotent: true });
      }
    }
    const count = (await repo.incidents.list()).length;
    const id = body.id || `${body.mode==="LIVE"?"LIVE":"INCIDENT"}-${String(count+42).padStart(3,"0")}-${randomUUID().slice(0,6)}`;
    const region = body.region || "Arabian Sea";
    // Use validated location or default
    const validated = body.location !== undefined ? validateLocation(body.location).value! : undefined;
    const location = validated || { lat:19.2, lon:64.5, label:"Arabian Sea · Off Mumbai" };
    const mode = body.mode === "LIVE" ? "LIVE" : "DEMO";
    // Satellite acquisition: CURRENT + PREVIOUS, bbox driven by selected region
    let observation: any = null;
    let liveMeta: any = null;
    let previousMeta: any = null;
    let pair: any = null;
    const effectiveBbox = resolveBboxFromRegion(region, body.bbox) || (body.bbox as [number,number,number,number] | undefined);
    if (mode === "LIVE") {
      const { getSatelliteProvider } = await import("@/lib/satellite/provider");
      const provider = getSatelliteProvider("LIVE") as any;
      const cfg = provider.configStatus();
      if (!cfg.configured) return NextResponse.json({ error: "LIVE SATELLITE NOT CONFIGURED", missing: cfg.missing, mode: "LIVE" }, { status: 412 });
      try {
        if (provider.acquirePair) {
          pair = await provider.acquirePair({ lat: location.lat, lon: location.lon, bbox: effectiveBbox, incidentId: id });
        } else {
          const cur = await provider.acquire({ lat: location.lat, lon: location.lon, bbox: effectiveBbox, incidentId: id });
          pair = { current: cur, previous: null };
        }
        liveMeta = pair.current;
        previousMeta = pair.previous;
        observation = liveMeta;
      } catch (e: any) {
        return NextResponse.json({ error: e.message || "LIVE acquisition failed", mode: "LIVE", status: "failed" }, { status: 502 });
      }
    } else {
      const { getSatelliteProvider } = await import("@/lib/satellite/provider");
      const demoProvider = getSatelliteProvider("DEMO") as any;
      const effBbox = effectiveBbox || [location.lon-0.5, location.lat-0.5, location.lon+0.5, location.lat+0.5] as [number,number,number,number];
      if (demoProvider.acquirePair) {
        pair = await demoProvider.acquirePair({ lat: location.lat, lon: location.lon, bbox: effBbox, incidentId: id });
      } else {
        const cur = await demoProvider.acquire({ lat: location.lat, lon: location.lon, bbox: effBbox, incidentId: id });
        pair = { current: cur, previous: null };
      }
      liveMeta = pair.current;
      previousMeta = pair.previous;
      observation = liveMeta;
    }
    let detection: any;
    if (liveMeta) {
      let liveBuffer: Buffer | undefined;
      let liveFileName = `${liveMeta.productId}.png`;
      try {
        if (liveMeta.previewUrl?.startsWith("data:image")) {
          const b64 = liveMeta.previewUrl.split(",")[1];
          liveBuffer = Buffer.from(b64, "base64");
        } else if (liveMeta.previewUrl?.startsWith("http")) {
          const r = await fetch(liveMeta.previewUrl, { signal: AbortSignal.timeout(10000) as any }).catch(()=>null) as any;
          if (r?.ok) liveBuffer = Buffer.from(await r.arrayBuffer());
        }
      } catch {}
      const base = await runDetection({ sourceImageId: liveMeta.productId, buffer: liveBuffer, fileName: liveFileName, regionHint: region, mode: mode as "LIVE" | "DEMO" });
      detection = base;
      detection.comparisonImageId = previousMeta ? previousMeta.productId : "NONE";
      const footprint = (liveMeta as any).footprint || { bbox: liveMeta.aoi.bbox };
      detection.location = { lat: liveMeta.aoi.lat, lon: liveMeta.aoi.lon, label: `${region} · ${mode} ${liveMeta.satellite} ${liveMeta.productId.slice(0,16)}`, bbox: liveMeta.aoi.bbox, footprint } as any;
      detection.detectionMethod = mode==="LIVE" ? `live-sentinel1-grd-analysis (${liveMeta.satellite})` : `demo-synthetic-sar (${liveMeta.satellite})`;
      const temporalNote = previousMeta
        ? `Potential SAR change detected between observations. Current ${liveMeta.productId} (${liveMeta.acquiredAt}) vs previous ${previousMeta.productId} (${previousMeta.acquiredAt}) — SAR alone does not confirm oil spill, requires human review.`
        : `Single SAR observation ${liveMeta.productId} (${liveMeta.acquiredAt}) — temporal comparison unavailable, previous scene not found.`;
      const hoursApart = previousMeta ? Math.round((new Date(liveMeta.acquiredAt).getTime() - new Date(previousMeta.acquiredAt).getTime())/3600000) : null;
      (detection as any).raw = { ...(detection as any).raw, liveObservation: liveMeta, previousObservation: previousMeta, mode, provider: liveMeta.provider, temporalNote, comparison: previousMeta ? { currentId: liveMeta.productId, currentAt: liveMeta.acquiredAt, previousId: previousMeta.productId, previousAt: previousMeta.acquiredAt, hoursApart, previousAvailable: true } : { previousAvailable: false } };
    } else {
      const base = await runDetection({ sourceImageId: body.sourceImageId || "DEMO-SAR-001", regionHint: region, mode: "DEMO" });
      detection = base;
      detection.comparisonImageId = "NONE";
      (detection as any).raw = { ...(detection as any).raw, mode: "DEMO", temporalNote: "Single DEMO observation — temporal comparison unavailable." };
    }
    const liveLocation = liveMeta ? { lat: liveMeta.aoi.lat, lon: liveMeta.aoi.lon, label: `${region} · ${mode} Sentinel-1 ${liveMeta.satellite} ${liveMeta.productId.slice(0,18)}`, bbox: liveMeta.aoi.bbox, footprint: (liveMeta as any).footprint } as any : location;
    const now = new Date();
    // For LIVE, previewUrl is already same-origin /api/incidents/[id]/sar-preview/[role] (never datahub $value) - v=4 busts cache after evalscript brightening
    // For DEMO, previewUrl is local synthetic /demo/sar/... (already same-origin)
    const primaryImageUrl = liveMeta ? (liveMeta.previewUrl || `/api/incidents/${id}/sar-preview/current?v=4`) : (body.imageUrl || "/demo/sar/demo-sar-current.png");
    const previousImageUrl = previousMeta ? (previousMeta.previewUrl || `/api/incidents/${id}/sar-preview/previous?v=4`) : null;
    const imageSourceType = liveMeta ? mode : (mode==="DEMO" ? "DEMO" : body.sourceImageId?.startsWith("DEMO") ? "DEMO" : "USER_UPLOAD");
    const primaryMetadata = liveMeta ? { ...serializeDates(detection) as any, liveObservation: liveMeta, previousObservation: previousMeta, mode } : serializeDates(detection) as any;

    // Atomic initial incident state: all records that must exist together for a valid newly created incident
    let persistedIncident: typeof liveLocation extends never ? never : any;
    try {
      await withTransaction(async (tx) => {
        const inc = await repo.incidents.create({ id, region, location: liveLocation, status:"investigating", severity:"unresolved", contextVersion:1, createdBy: mode==="LIVE"?"live-operator":"demo-operator", createdAt: now, updatedAt: now } as any, tx);
        persistedIncident = inc;
        await repo.detectionRuns.create({ id: randomUUID(), incidentId:id, anomalyDetected: detection.anomalyDetected, confidence: detection.confidence, affectedAreaEstimate: detection.affectedAreaEstimate, location: detection.location as any, detectionMethod: detection.detectionMethod + (liveMeta?` (${mode} ${liveMeta.satellite})`:""), sourceImageId: detection.sourceImageId, comparisonImageId: detection.comparisonImageId, rawResult: detection.raw as any, processingLatencyMs: detection.processingLatencyMs }, tx);
        for (const agentType of ["historical","investigation","evidence"] as const) {
          await repo.agentRuns.create({ id: randomUUID(), incidentId:id, agentType, status:"queued", contextVersion:1 } as any, tx);
        }
        // Primary CURRENT image
        await repo.incidentImages.create({ id: randomUUID(), incidentId:id, sourceType: imageSourceType, url: primaryImageUrl, metadata: { ...primaryMetadata, role: "current", observation: serializeDates(liveMeta) } }, tx);
        // Previous image if available (never duplicate CURRENT, never DEMO fallback in LIVE)
        if (previousMeta && previousImageUrl && previousMeta.productId !== liveMeta?.productId) {
          await repo.incidentImages.create({ id: randomUUID(), incidentId:id, sourceType: imageSourceType, url: previousImageUrl, metadata: { ...serializeDates(detection) as any, role: "previous", observation: serializeDates(previousMeta), mode } }, tx);
        }
        await repo.contextVersions.create({ id: randomUUID(), incidentId:id, version:1, snapshot:{ incident: serializeDates(inc), mode, liveObservation: liveMeta, previousObservation: previousMeta, bbox: effectiveBbox, region } }, tx);
        await repo.timelineEvents.create({ id: randomUUID(), incidentId:id, type:"incident_created", payload:{ incident: serializeDates(inc), mode, liveObservation: liveMeta ? { productId: liveMeta.productId, acquiredAt: liveMeta.acquiredAt, provider: liveMeta.provider } : undefined, previousObservation: previousMeta ? { productId: previousMeta.productId, acquiredAt: previousMeta.acquiredAt } : undefined } }, tx);
        await repo.timelineEvents.create({ id: randomUUID(), incidentId:id, type:"detection_completed", payload:{ detection: serializeDates(detection), mode, liveObservation: liveMeta ? { productId: liveMeta.productId, satellite: liveMeta.satellite, acquiredAt: liveMeta.acquiredAt } : undefined, previousObservation: previousMeta ? { productId: previousMeta.productId, acquiredAt: previousMeta.acquiredAt } : undefined } }, tx);
      });
    } catch (e: any) {
      console.error(JSON.stringify({ route:"incidents/create", event:"transaction failed", incidentId:id, error:String(e?.message||e) }));
      return NextResponse.json({ error: "Failed to create incident", details: String(e?.message||e).slice(0,300) }, { status: 500 });
    }
    const incident = persistedIncident;
    // Background agent pipeline after successful commit (non-blocking, with structured logging)
    const { runDemoPipeline } = await import("@/lib/agents/pipeline");
    setImmediate(() => {
      runDemoPipeline(id).catch((err) => {
        console.error(JSON.stringify({ route:"incidents/create", event:"background pipeline failed", incidentId:id, error:String(err?.message||err) }));
      });
    });
    return NextResponse.json({ incident: serializeDates(incident), detection: serializeDates(detection), observation: liveMeta ? serializeDates(liveMeta) : undefined, previousObservation: previousMeta ? serializeDates(previousMeta) : undefined, mode, idempotent: false }, { status: 202 });
  };

  if (idemKey) {
    const key = buildIdempotencyKey("incidents:create", body.id);
    try {
      const result = await withIdempotency(key, body, "incidents:create", handler);
      return result instanceof NextResponse ? result : NextResponse.json(serializeDates(result as any));
    } catch (e) {
      if ((e as Error).message === "IDEMPOTENCY_CONFLICT: Same key used with different payload") {
        return NextResponse.json({ error: "Idempotency key conflict: same key with different payload" }, { status: 409 });
      }
      throw e;
    }
  }

  return await handler();
}
