import { RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk";

export type BroadcastResult = { sent: boolean; mode: "live" | "unconfigured" | "error"; error?: string };

// In-process cache to prevent concurrent room creation storms
const roomCreationCache = new Map<string, Promise<void>>();
const roomExistsCache = new Set<string>();

function getRoomName(incidentId: string): string {
  return `bluesentinel-${incidentId}`;
}

async function ensureRoom(roomName: string, client: RoomServiceClient): Promise<void> {
  if (roomExistsCache.has(roomName)) return;
  const existing = roomCreationCache.get(roomName);
  if (existing) {
    await existing;
    return;
  }
  const promise = (async () => {
    try {
      await client.createRoom({ name: roomName, emptyTimeout: 60 * 60, maxParticipants: 50 } as any);
      roomExistsCache.add(roomName);
    } catch (e: any) {
      const msg = String(e?.message || e).toLowerCase();
      // Room already exists is not an error — treat as success
      if (msg.includes("already exists") || msg.includes("already") || msg.includes("duplicate") || (e?.code === 409)) {
        roomExistsCache.add(roomName);
        return;
      }
      // For genuine config errors, log and throw to preserve graceful degradation
      console.warn(JSON.stringify({ provider: "livekit", event: "ensureRoom failed", roomName, error: String(e?.message || e).slice(0, 300) }));
      throw e;
    } finally {
      // Clean up promise cache after resolution (keep exists cache)
      roomCreationCache.delete(roomName);
    }
  })();
  roomCreationCache.set(roomName, promise);
  await promise;
}

export async function broadcastEvent(incidentId: string, event: Record<string, unknown>): Promise<BroadcastResult> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !secret || !url) return { sent: false, mode: "unconfigured" };
  const httpUrl = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  const client = new RoomServiceClient(httpUrl, apiKey, secret);
  const payload = new TextEncoder().encode(JSON.stringify(event));
  const room = getRoomName(incidentId);

  // Ensure room exists before sending (fixes "requested room does not exist" for brand-new incidents)
  try {
    await ensureRoom(room, client);
  } catch (e: any) {
    const error = String(e?.message || e);
    // Genuine config/provider error — preserve graceful degradation, do not break persistence
    console.warn(JSON.stringify({ provider: "livekit", event: "ensureRoom failed, aborting broadcast", incidentId, room, error: error.slice(0, 300) }));
    return { sent: false, mode: "error", error };
  }

  try {
    await client.sendData(room, payload, DataPacket_Kind.RELIABLE);
    return { sent: true, mode: "live" };
  } catch (e: any) {
    const msg = String(e?.message || e).toLowerCase();
    const isRoomNotExist = msg.includes("room does not exist") || msg.includes("does not exist") || msg.includes("not found");
    if (isRoomNotExist) {
      // One retry path: ensure room again and retry send once
      console.warn(JSON.stringify({ provider: "livekit", event: "sendData room not exist, retrying ensureRoom", incidentId, room, error: String(e?.message || e).slice(0, 300) }));
      roomExistsCache.delete(room);
      try {
        await ensureRoom(room, client);
        await client.sendData(room, payload, DataPacket_Kind.RELIABLE);
        return { sent: true, mode: "live" };
      } catch (retryErr: any) {
        const error = String(retryErr?.message || retryErr);
        console.warn(JSON.stringify({ provider: "livekit", event: "broadcastEvent retry failed", incidentId, type: String((event as any)?.type || "unknown"), error: error.slice(0, 300) }));
        return { sent: false, mode: "error", error };
      }
    }
    const error = String(e?.message || e);
    console.warn(JSON.stringify({ provider: "livekit", event: "broadcastEvent failed", incidentId, type: String((event as any)?.type || "unknown"), error: error.slice(0, 300) }));
    return { sent: false, mode: "error", error };
  }
}

export function withBroadcast<T>(incidentId: string, event: Record<string, unknown>): void {
  broadcastEvent(incidentId, event).catch((err) => {
    console.warn(JSON.stringify({ provider: "livekit", event: "withBroadcast failed", incidentId, error: String(err?.message || err).slice(0, 200) }));
  });
}
