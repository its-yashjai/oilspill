// Simple in-memory store for fallback when DB not available (ensures demo always works)
export type MemIncident = {
  id: string;
  region: string;
  location: { lat: number; lon: number; label: string };
  status: string;
  severity: string;
  contextVersion: number;
  createdAt: string;
  updatedAt: string;
};
export type MemFinding = any;
export type MemTimeline = { id: string; incidentId: string; type: string; payload: any; createdAt: string };
export type MemIdempotencyKey = {
  key: string;
  requestHash: string;
  response: Record<string, unknown>;
  endpoint: string;
  createdAt: string;
  expiresAt: string;
};

const makeStore = () => ({
  incidents: new Map<string, any>(),
  images: new Map<string, any>(),
  detections: new Map<string, any>(),
  findings: new Map<string, any[]>(),
  observations: new Map<string, any[]>(),
  timeline: new Map<string, MemTimeline[]>(),
  contextVersions: new Map<string, any[]>(),
  disagreements: new Map<string, any[]>(),
  gaps: new Map<string, any[]>(),
  decisions: new Map<string, any[]>(),
  reports: new Map<string, any>(),
  notifications: [] as any[],
  historicalSeed: [] as any[],
  idempotencyKeys: new Map<string, MemIdempotencyKey>(),
});

const shared = globalThis as typeof globalThis & {
  __blueSentinelStore?: ReturnType<typeof makeStore>;
};
const store = (shared.__blueSentinelStore ??= makeStore());

export function createStore(){ return store; }
export function getStore(){ return store; }
