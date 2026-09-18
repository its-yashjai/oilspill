import { z } from "zod";
export const createIncidentSchema = z.object({
  region: z.string().min(2).max(100).optional(),
  location: z.object({ lat: z.number(), lon: z.number(), label: z.string() }).optional(),
  sourceImageId: z.string().min(1).optional(),
  imageDataUrl: z.string().optional(),
});
export const observationSchema = z.object({ text: z.string().min(2).max(2000), author: z.string().min(1).max(100).default("operator") });
export const decisionSchema = z.object({ action: z.enum(["mark_low_concern","escalate","resolve","request_evidence","request_more_evidence"]).transform(v => v==="request_more_evidence" ? "request_evidence" : v), reasoning: z.string().max(2000).optional() });
