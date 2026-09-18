import { NextRequest, NextResponse } from "next/server";
import { repo, serializeDates } from "@/lib/db/repo";
import { withIdempotency, buildIdempotencyKey, getIdempotencyKeyFromRequest } from "@/lib/idempotency";
import { randomUUID } from "node:crypto";

export async function POST(req:NextRequest, { params }:{ params:Promise<{id:string}>}){
  const { id } = await params;
  const inc = await repo.incidents.getById(id);
  if(!inc) return NextResponse.json({ error:"not found"},{status:404});
  const idemKey = getIdempotencyKeyFromRequest(req);

  const handler = async () => {
    const state = await repo.incidents.getById(id).then(() => import("@/lib/db/repo").then(m => m.getIncidentState(id)));
    if (!state) throw new Error("incident not found");
    const { incident, detection, findings, observations, timeline, gaps, disagreements, decisions, notifications } = state;
    const md = `# BlueSentinel Incident Report — ${id}
**Date:** ${new Date().toISOString()}
**Location:** ${incident.location?.label} (${(incident.location as any)?.lat}, ${(incident.location as any)?.lon})
**Region:** ${incident.region}
**Status:** ${incident.status} | **Severity:** ${incident.severity} | **Context v${incident.contextVersion}

## Detection
\`\`\`json
${JSON.stringify(detection, null, 2)}
\`\`\`

## Findings (${findings.length})
${findings.map((f:any)=> `### ${f.agentType} — ${f.status} (v${f.contextVersion}, confidence ${f.confidence})
${f.summary}

- Supporting: ${ (f.supportingEvidence||[]).join("; ") }
- Contradictory: ${ (f.contradictoryEvidence||[]).join("; ")
}
- Needed: ${ (f.informationNeeded||[]).join("; ") }
- Moss IDs: ${ (f.mossEvidenceIds||[]).join(", ") } | Moss latency: ${f.mossLatencyMs||"-"} ms
`).join("\n")}

## Disagreements
${disagreements.map((d:any)=> `- v${d.contextVersion}: ${d.reason}`).join("\n") || "None"}

## Information Gaps
${gaps.map((g:any)=> `- v${g.contextVersion}: ${g.gaps.join(", ")}`).join("\n") || "None"}

## Human Observations
${observations.map((o:any)=> `- ${o.author} @ ${o.createdAt}: ${o.text}`).join("\n") || "None"}

## Human Decisions
${decisions.map((d:any)=> `- ${d.action} @ ${d.createdAt}: ${d.reasoning||""}`).join("\n") || "None"}

## Timeline (${timeline.length} events)
${timeline.map((t:any)=> `- ${t.createdAt} — ${t.type} — ${JSON.stringify(t.payload).slice(0,180)}`).join("\n")}

## Notifications
${notifications.map((n:any)=> `- ${n.subject} (${n.status}) to ${n.toEmail}`).join("\n") || "None"}

## Moss Metrics
${findings.map((f:any)=> `- ${f.agentType}: ${f.mossLatencyMs} ms — IDs: ${(f.mossEvidenceIds||[]).join(", ")}`).join("\n")}

> AI-generated synthesis is labeled per FACT/INFERENCE/HYPOTHESIS/UNKNOWN inside findings. Observed evidence is listed under supportingEvidence.
`;
    const json = { incident, detection, findings, observations, timeline, gaps, disagreements, decisions, notifications };
    const report = await repo.reports.create({ id: randomUUID(), incidentId:id, markdown: md, json: serializeDates(json) as any });
    await repo.timelineEvents.create({ id: randomUUID(), incidentId:id, type:"report_created", payload:{ reportId: report.id } });
    return NextResponse.json({ report: serializeDates(report), idempotent: false });
  };

  if (idemKey) {
    const key = buildIdempotencyKey("incidents:report", id);
    try {
      const result = await withIdempotency(key, { id }, "incidents:report", handler);
      return result instanceof NextResponse ? result : NextResponse.json(serializeDates(result as any));
    } catch (e) {
      if ((e as Error).message === "IDEMPOTENCY_CONFLICT: Same key used with different payload") {
        return NextResponse.json({ error: "Idempotency key conflict: same key with different payload" }, { status: 409 });
      }
      throw e;
    }
  }
  const key = buildIdempotencyKey("incidents:report", id);
  try {
    const result = await withIdempotency(key, { id }, "incidents:report", handler);
    return result instanceof NextResponse ? result : NextResponse.json(serializeDates(result as any));
  } catch (e) {
    if ((e as Error).message === "IDEMPOTENCY_CONFLICT: Same key used with different payload") {
      return NextResponse.json({ error: "Idempotency key conflict: same key with different payload" }, { status: 409 });
    }
    throw e;
  }
}

export async function GET(_:NextRequest, { params }:{ params:Promise<{id:string}>}){
  const { id } = await params;
  const state = await import("@/lib/db/repo").then(m => m.getIncidentState(id));
  const report = state?.reports ?? null;
  if(!report) return NextResponse.json({ report:null });
  return NextResponse.json({ report: serializeDates(report) });
}
