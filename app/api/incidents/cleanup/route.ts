import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { incidents, incidentImages, detectionRuns, agentRuns, findings, observations, timelineEvents, contextVersions, informationGaps, agentDisagreements, humanDecisions, notifications, reports, idempotencyKeys } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.filter !== "demo") return NextResponse.json({ error: "filter must be demo" }, { status: 400 });
  const { db } = getDb();
  const demoImages = await db.select({ incidentId: incidentImages.incidentId }).from(incidentImages).where(eq(incidentImages.sourceType, "DEMO"));
  const demoIds = [...new Set(demoImages.map(r => r.incidentId))];
  const likeIds = await db.select({ id: incidents.id }).from(incidents).where(eq(incidents.id, "demo-incident-001"));
  for (const r of likeIds) if (!demoIds.includes(r.id)) demoIds.push(r.id);
  const allDemo = await db.select({ id: incidents.id }).from(incidents);
  const filtered = allDemo.filter(r => r.id.startsWith("demo-")).map(r => r.id);
  for (const id of filtered) if (!demoIds.includes(id)) demoIds.push(id);
  if (demoIds.length === 0) return NextResponse.json({ deleted: 0, deletedIds: [] });
  for (const table of [reports, notifications, humanDecisions, agentDisagreements, informationGaps, contextVersions, timelineEvents, observations, findings, agentRuns, detectionRuns, incidentImages] as const) {
    try { await db.delete(table as any).where(inArray((table as any).incidentId, demoIds)); } catch {}
  }
  try { await db.delete(idempotencyKeys).where(inArray(idempotencyKeys.key, demoIds.flatMap(id => [`idem:incidents:create:${id.toLowerCase()}`, `idem:agents:run:${id.toLowerCase()}:v1`] as any))); } catch {}
  await db.delete(incidents).where(inArray(incidents.id, demoIds));
  return NextResponse.json({ deleted: demoIds.length, deletedIds: demoIds });
}
