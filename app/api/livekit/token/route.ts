import { NextRequest, NextResponse } from "next/server";
import { mintLiveKitToken } from "@/lib/livekit/token";
import { withIdempotency, buildIdempotencyKey, getIdempotencyKeyFromRequest } from "@/lib/idempotency";

export async function POST(req: NextRequest){
  const body = await req.json().catch(()=>({}));
  if (!body || typeof body.identity !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(body.identity) ||
      typeof body.room !== "string" || !/^bluesentinel-[a-zA-Z0-9_-]{1,128}$/.test(body.room)) {
    return NextResponse.json({ error: "A stable identity and incident room are required" }, { status: 400 });
  }
  const { identity, room } = body;
  const idemKey = getIdempotencyKeyFromRequest(req);

  const handler = async () => {
    const res = await mintLiveKitToken(identity, room);
    if(!res.token) return NextResponse.json({ token:null, mode:"unconfigured", message:"LiveKit not configured — local mode" });
    return NextResponse.json({ token: res.token, url: res.url, mode: res.mode, idempotent: false });
  };

  if (idemKey) {
    const key = buildIdempotencyKey("livekit:token", room, identity);
    try {
      const result = await withIdempotency(key, body, "livekit:token", handler);
      return result instanceof NextResponse ? result : NextResponse.json(result);
    } catch (e) {
      if ((e as Error).message === "IDEMPOTENCY_CONFLICT: Same key used with different payload") {
        return NextResponse.json({ error: "Idempotency key conflict: same key with different payload" }, { status: 409 });
      }
      throw e;
    }
  }

  return await handler();
}