import { NextRequest, NextResponse } from "next/server";
import { repo } from "@/lib/db/repo";
import { renderSarPreviewBytes, getDemoPreviewBytes } from "@/lib/satellite/sarPreview";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; role: string }> }
) {
  const { id, role } = await params;
  if (role !== "current" && role !== "previous") {
    return NextResponse.json({ error: "Invalid role, must be current or previous" }, { status: 400 });
  }

  const incident = await repo.incidents.getById(id);
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  // Determine mode from incident or detection
  const detections = await repo.detectionRuns.listByIncident(id);
  const detection = detections.at(-1);
  const mode = (detection?.rawResult as any)?.mode || (incident as any).mode || "DEMO";

  // Try to get observation from incidentImages (role) or detection raw
  let observation: any = null;
  let bbox: [number, number, number, number] | undefined;
  let productId: string | undefined;
  let acquiredAt: string | undefined;

  // Try incidentImages first
  try {
    const images = await repo.incidentImages.listByIncident(id);
    const img = images.find((im: any) => im.metadata?.role === role);
    if (img?.metadata?.observation) {
      observation = img.metadata.observation;
    } else if (img?.metadata?.liveObservation && role === "current") {
      observation = img.metadata.liveObservation;
    } else if (img?.metadata?.previousObservation && role === "previous") {
      observation = img.metadata.previousObservation;
    }
    // Fallback: if not found by role, try to find any image with matching role
    if (!observation) {
      // For current, try first image
      if (role === "current" && images[0]?.metadata?.observation) {
        observation = images[0].metadata.observation;
      }
    }
  } catch (e) {
    console.warn(JSON.stringify({ route: "sar-preview", event: "failed to list images", incidentId: id, error: String(e) }));
  }

  // Fallback to detection raw
  if (!observation && detection) {
    const raw: any = detection.rawResult;
    if (role === "current" && raw?.liveObservation) observation = raw.liveObservation;
    if (role === "previous" && raw?.previousObservation) observation = raw.previousObservation;
  }

  // Fallback to contextVersions snapshot
  if (!observation) {
    try {
      const cvs = await repo.contextVersions.listByIncident(id);
      const cv = cvs.find((c) => c.version === 1) || cvs[0];
      const snap: any = cv?.snapshot;
      if (snap) {
        if (role === "current" && snap.liveObservation) observation = snap.liveObservation;
        if (role === "previous" && snap.previousObservation) observation = snap.previousObservation;
      }
    } catch {}
  }

  if (!observation) {
    return NextResponse.json({ error: `No ${role} observation found for incident` }, { status: 404 });
  }

  // DEMO mode: serve local synthetic file, no Process API
  const obsMode = observation.mode || mode;
  if (obsMode === "DEMO" || observation.provider === "DEMO/SIMULATED") {
    try {
      const { buffer, contentType } = await getDemoPreviewBytes(observation.aoi?.bbox as any, role);
      return new NextResponse(buffer as any, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=300, s-maxage=600",
          "X-Preview-Role": role,
          "X-Preview-Mode": "DEMO",
        },
      });
    } catch (e: any) {
      console.error(JSON.stringify({ route: "sar-preview", event: "demo preview failed", incidentId: id, role, error: String(e?.message || e) }));
      return NextResponse.json({ error: "Failed to load DEMO preview" }, { status: 500 });
    }
  }

  // LIVE mode: need productId, bbox, acquiredAt
  productId = observation.productId || observation.sceneId;
  acquiredAt = observation.acquiredAt;
  bbox = observation.footprint?.bbox || observation.aoi?.bbox;

  if (!productId || !acquiredAt || !bbox) {
    console.error(JSON.stringify({ route: "sar-preview", event: "missing metadata for LIVE", incidentId: id, role, productId, acquiredAt, bbox }));
    return NextResponse.json({ error: "Missing LIVE observation metadata (productId/bbox/acquiredAt)" }, { status: 500 });
  }

  // Validate bbox
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
    return NextResponse.json({ error: "Invalid bbox for preview" }, { status: 500 });
  }

  try {
    const { buffer, contentType } = await renderSarPreviewBytes({
      productId,
      bbox: bbox as [number, number, number, number],
      acquiredAt,
      role,
    });
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Bust cache after evalscript brightening - old dark PNGs were cached 60s in browser/CDN
        "Cache-Control": "no-store, must-revalidate",
        "X-Preview-ProductId": productId,
        "X-Preview-Role": role,
        "X-Preview-AcquiredAt": acquiredAt,
        "X-Preview-Version": "v4-fix-time-ms-bright",
      },
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    console.error(JSON.stringify({ route: "sar-preview", event: "Process API failed", incidentId: id, role, productId, error: msg.slice(0, 500) }));
    // Do NOT return raw OData URL, do NOT fallback to DEMO in LIVE mode
    return NextResponse.json({ error: "Failed to render LIVE SAR preview", details: msg.slice(0, 300) }, { status: 502 });
  }
}
