export async function mintLiveKitToken(identity: string, room: string){
  const apiKey = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if(!apiKey || !secret || !url) return { token: null, mode:"unconfigured" as const };
  const { AccessToken } = await import("livekit-server-sdk");
  const at = new AccessToken(apiKey, secret, { identity });
  at.addGrant({ roomJoin: true, room, canPublish:true, canSubscribe:true, canPublishData:true });
  const token = await at.toJwt();
  return { token, url, mode:"live" as const };
}
