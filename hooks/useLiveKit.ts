"use client";
import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, RemoteParticipant, LocalParticipant, ConnectionState } from "livekit-client";

interface UseLiveKitOptions {
  incidentId: string;
  identity?: string;
  onParticipantConnected?: (participant: RemoteParticipant) => void;
  onParticipantDisconnected?: (participant: RemoteParticipant) => void;
  onDataReceived?: (payload: Uint8Array, participant?: RemoteParticipant) => void;
}

export function useLiveKit(options: UseLiveKitOptions) {
  const { incidentId, identity } = options;
  const callbacks = useRef(options);
  const roomRef = useRef<Room | null>(null);
  const identityRef = useRef<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { callbacks.current = options; });

  useEffect(() => {
    let disposed = false;
    let ownedRoom: Room | null = null;
    const controller = new AbortController();
    setConnectionState(ConnectionState.Disconnected);
    setParticipants([]);
    setLocalParticipant(null);
    setError(null);

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      controller.abort();
      if (ownedRoom) {
        ownedRoom.removeAllListeners();
        void ownedRoom.disconnect();
        if (roomRef.current === ownedRoom) roomRef.current = null;
      }
    };

    const timer = window.setTimeout(() => {
      const start = async () => {
        try {
          if (!identityRef.current) {
            try {
              identityRef.current = sessionStorage.getItem("bluesentinel.operator.identity");
            } catch {}
            if (!identityRef.current) {
              identityRef.current = `operator-${crypto.randomUUID()}`;
              try { sessionStorage.setItem("bluesentinel.operator.identity", identityRef.current); } catch {}
            }
          }
          if (disposed) return;
          setConnectionState(ConnectionState.Connecting);
          const response = await fetch("/api/livekit/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identity: identity || identityRef.current, room: `bluesentinel-${incidentId}` }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("LiveKit token request failed");
          const data: unknown = await response.json();
          if (disposed) return;
          if (!data || typeof data !== "object" || !("token" in data) || !("url" in data) ||
              typeof data.token !== "string" || typeof data.url !== "string") {
            throw new Error("LiveKit is not configured or token is unavailable");
          }
          const room = new Room();
          ownedRoom = room;
          roomRef.current = room;
          const updateParticipants = () => {
            if (disposed) return;
            setParticipants(Array.from(room.remoteParticipants.values()));
            setLocalParticipant(room.localParticipant);
          };
          room.on(RoomEvent.ParticipantConnected, participant => {
            if (disposed) return;
            updateParticipants();
            callbacks.current.onParticipantConnected?.(participant);
          });
          room.on(RoomEvent.ParticipantDisconnected, participant => {
            if (disposed) return;
            updateParticipants();
            callbacks.current.onParticipantDisconnected?.(participant);
          });
          room.on(RoomEvent.DataReceived, (payload, participant) => {
            if (!disposed) callbacks.current.onDataReceived?.(payload, participant);
          });
          room.on(RoomEvent.ConnectionStateChanged, state => {
            if (disposed) return;
            setConnectionState(state);
            if (state === ConnectionState.Disconnected) {
              setParticipants([]);
              setLocalParticipant(null);
            }
          });
          await room.connect(data.url, data.token);
          if (!disposed) updateParticipants();
        } catch (cause) {
          if (disposed) return;
          if (ownedRoom) {
            ownedRoom.removeAllListeners();
            void ownedRoom.disconnect();
            roomRef.current = null;
            ownedRoom = null;
          }
          setConnectionState(ConnectionState.Disconnected);
          setError(cause instanceof Error && cause.message.startsWith("LiveKit") ? cause.message : "LiveKit connection failed");
        }
      };
      void start();
    }, 0);

    window.addEventListener("pagehide", dispose);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", dispose);
      dispose();
    };
  }, [incidentId, identity]);

  return { room: roomRef.current, isConnected: connectionState === ConnectionState.Connected,
    connectionState, participants, localParticipant, error };
}
