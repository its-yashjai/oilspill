export type ObservationMode = "DEMO" | "LIVE";
export type SatelliteObservation = {
  observationId: string;
  mode: ObservationMode;
  provider: string;
  satellite: string;
  productId: string;
  sceneId: string;
  acquiredAt: string;
  aoi: { lat: number; lon: number; bbox?: [number, number, number, number] };
  previewUrl?: string;
  attribution: string;
  metadata: Record<string, unknown>;
  footprint?: { bbox?: [number, number, number, number]; geometry?: any };
};

export type SatelliteObservationPair = {
  current: SatelliteObservation;
  previous: SatelliteObservation | null;
};

export type AcquireInput = {
  lat: number;
  lon: number;
  bbox?: [number, number, number, number];
  incidentId?: string;
};
export interface SatelliteProvider {
  mode: ObservationMode;
  isConfigured(): boolean;
  configStatus(): { configured: boolean; missing: string[] };
  acquire(input: AcquireInput): Promise<SatelliteObservation>;
  acquirePair?(input: AcquireInput): Promise<SatelliteObservationPair>;
}
