import { NextRequest, NextResponse } from "next/server";
import { runDetection } from "@/lib/detection/engine";
import { withIdempotency, buildIdempotencyKey, getIdempotencyKeyFromRequest } from "@/lib/idempotency";
import { repo, serializeDates } from "@/lib/db/repo";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest){
  const form = await req.formData().catch(()=>null);
  if(!form) return NextResponse.json({ error:"invalid form"},{status:400});
  const file = form.get("file") as File | null;
  const sourceImageId = (form.get("sourceImageId") as string) || "USER-UPLOAD";
  const incidentId = (form.get("incidentId") as string) || "";
  if(!file) return NextResponse.json({ error:"file required"},{status:400});
  if(file.size > 8*1024*1024) return NextResponse.json({ error:"file too large (max 8MB)"},{status:400});
  const allowed = ["image/jpeg","image/png","image/webp","image/jpg"];
  if(!allowed.includes(file.type)) return NextResponse.json({ error:`invalid type ${file.type}`},{status:400});
  const buf = Buffer.from(await file.arrayBuffer());
  const idemKey = getIdempotencyKeyFromRequest(req);

  const handler = async () => {
    const result = await runDetection({ sourceImageId, buffer: buf, fileName: file.name });
    if (incidentId) {
      const incident = await repo.incidents.getById(incidentId);
      if (incident) {
        await repo.detectionRuns.create({ id: randomUUID(), incidentId, anomalyDetected: result.anomalyDetected, confidence: result.confidence, affectedAreaEstimate: result.affectedAreaEstimate, location: result.location as any, detectionMethod: result.detectionMethod, sourceImageId: result.sourceImageId, comparisonImageId: result.comparisonImageId, rawResult: result.raw as any, processingLatencyMs: result.processingLatencyMs });
        await repo.timelineEvents.create({ id: randomUUID(), incidentId, type:"detection_completed", payload:{ detection: serializeDates(result) } });
      }
    }
    return NextResponse.json({ detection: serializeDates(result), sourceType:"USER_UPLOAD", idempotent: false });
  };

  if (idemKey) {
    const key = buildIdempotencyKey("detect", sourceImageId, incidentId || undefined);
    try {
      const result = await withIdempotency(key, { sourceImageId, incidentId, fileName: file.name, fileSize: file.size }, "detect", handler);
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
