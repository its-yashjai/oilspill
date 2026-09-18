import { repo, serializeDates } from "../db/repo";
import { withIdempotency, buildIdempotencyKey } from "../idempotency";
import { randomUUID } from "node:crypto";

export async function sendAlertIfNeeded(incidentId: string, contextVersion?: number): Promise<{ sent: boolean; mode: string; reason?: string; error?: string }> {
  const inc = await repo.incidents.getById(incidentId);
  if(!inc) return { sent:false, reason:"no incident", mode:"error" };
  const findings = await repo.findings.listByIncident(incidentId);
  const hist = findings.find((f:any)=>f.agentType==="historical");
  const evd = findings.find((f:any)=>f.agentType==="evidence");
  const detections = await repo.detectionRuns.listByIncident(incidentId);
  const detection = detections.at(-1);
  const shouldAlert = inc.severity==="elevated" || (hist && hist.confidence>0.75 && detection && detection.confidence>0.85);
  if(!shouldAlert) return { sent:false, reason:"threshold not met", mode:"none" };

  const version = contextVersion || inc.contextVersion;
  
  const handler = async () => {
    const subject = `BlueSentinel Alert — Elevated Environmental Concern [${incidentId}]`;
    const body = `Incident: ${incidentId}\nLocation: ${(inc.location as any)?.label}\nAssessment: Elevated concern\nDetection confidence: ${detection?.confidence}\nHistorical similarity: ${hist?.confidence}\nEvidence: ${(hist?.supportingEvidence?.length||0)} supporting sources\nInformation gaps: ${(evd?.informationNeeded?.length||0)}\nHuman review: Required\n\nThis is an automated defensive environmental alert.`;
    const toEmail = process.env.ALERT_TO_EMAIL || "operator@bluesentinel.local";
    if(process.env.RESEND_API_KEY){
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({ from: process.env.ALERT_FROM_EMAIL || "alert@bluesentinel.local", to: toEmail, subject, text: body });
        await repo.notifications.create({ id: randomUUID(), incidentId, subject, body, status:"sent", toEmail });
        await repo.timelineEvents.create({ id: randomUUID(), incidentId, type:"email_sent", payload:{ subject, toEmail } });
        return { sent:true, mode:"resend" };
      } catch(e:any){
        await repo.notifications.create({ id: randomUUID(), incidentId, subject, body, status:"logged", toEmail });
        return { sent:false, mode:"logged", error:String(e) };
      }
    } else {
      await repo.notifications.create({ id: randomUUID(), incidentId, subject, body, status:"logged", toEmail });
      await repo.timelineEvents.create({ id: randomUUID(), incidentId, type:"email_sent", payload:{ subject, toEmail, mode:"logged" } });
      console.log("[email:logged]", subject, body);
      return { sent:true, mode:"logged" };
    }
  };

  const key = buildIdempotencyKey("email:alert", incidentId, undefined, version);
  try {
    return await withIdempotency(key, { incidentId, version }, "email:alert", handler);
  } catch (e) {
    if ((e as Error).message === "IDEMPOTENCY_CONFLICT: Same key used with different payload") {
      return { sent:false, mode:"error", error:"Idempotency key conflict" };
    }
    throw e;
  }
}
