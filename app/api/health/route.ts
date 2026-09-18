import { NextResponse } from "next/server";
import { isLLMConfigured } from "@/lib/llm/provider";
import { getDb, getMode } from "@/lib/db/index";
import { repo } from "@/lib/db/repo";
export async function GET(){
  const hasMoss = !!(process.env.MOSS_PROJECT_ID && process.env.MOSS_PROJECT_KEY);
  const hasLiveKit = !!(process.env.NEXT_PUBLIC_LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  const hasLLM = isLLMConfigured();
  const hasEmail = !!process.env.RESEND_API_KEY;
  const { mode } = getDb();
  let incidents = 0;
  try { incidents = (await repo.incidents.list()).length; } catch {}
  return NextResponse.json({
    status:"ok",
    moss: hasMoss ? "configured" : "fallback",
    livekit: hasLiveKit ? "configured" : "local",
    llm: hasLLM ? "real" : "mock",
    email: hasEmail ? "resend" : "logged",
    incidents,
    mode: mode || (process.env.DATABASE_URL ? "pg" : "pglite/memory")
  });
}
