import { randomUUID } from "node:crypto";
import type { SatelliteProvider, SatelliteObservation, AcquireInput, SatelliteObservationPair } from "./types";
import { DEMO_IMAGES } from "../detection/demo-images";

const DEMO_BBOX_PRESETS: Record<string, [number,number,number,number]> = {
  "arabian-sea": [64.0, 18.7, 65.0, 19.7],
  "bay-of-bengal": [82.0, 5.5, 92.0, 22.5],
  "red-sea": [34.0, 12.5, 42.5, 28.0],
  "mediterranean": [10.0, 30.0, 36.0, 46.0],
  "south-china-sea": [105.0, 0.0, 120.0, 25.0],
  "gulf-of-mexico": [-98.0, 18.0, -80.0, 31.0],
};

function bboxForInput(input: AcquireInput): [number,number,number,number] | undefined {
  if (input.bbox) return input.bbox;
  // derive from lat/lon fallback
  const lat = input.lat ?? 19.2;
  const lon = input.lon ?? 64.5;
  return [lon-0.5, lat-0.5, lon+0.5, lat+0.5];
}

export class DemoSatelliteProvider implements SatelliteProvider {
  mode = "DEMO" as const;
  isConfigured() { return true; }
  configStatus() { return { configured: true, missing: [] }; }

  async acquirePair(input: AcquireInput): Promise<SatelliteObservationPair> {
    const lat = input.lat ?? DEMO_IMAGES[0].location.lat;
    const lon = input.lon ?? DEMO_IMAGES[0].location.lon;
    const bbox = bboxForInput(input) || [lon-0.5, lat-0.5, lon+0.5, lat+0.5];
    const now = Date.now();
    const currentAcquiredAt = new Date(now - 12*3600*1000).toISOString(); // 12h ago
    const previousAcquiredAt = new Date(now - 60*3600*1000).toISOString(); // 60h ago ~ 2.5 days, within 24-72h
    const current: SatelliteObservation = {
      observationId: `DEMO-${randomUUID()}`,
      mode: "DEMO",
      provider: "DEMO/SIMULATED",
      satellite: "Sentinel-1 (simulated)",
      productId: "DEMO-SAR-001",
      sceneId: "DEMO-SAR-001",
      acquiredAt: currentAcquiredAt,
      aoi: { lat, lon, bbox },
      previewUrl: "/demo/sar/demo-sar-current.png",
      attribution: "DEMO/SIMULATED — not a live satellite observation — synthetic SAR",
      metadata: { demoId: "DEMO-SAR-001", location: { lat, lon }, bbox, synthetic: true },
      footprint: { bbox, geometry: { type: "Polygon", coordinates: [[[bbox[0], bbox[1]],[bbox[2], bbox[1]],[bbox[2], bbox[3]],[bbox[0], bbox[3]],[bbox[0], bbox[1]]]] } },
    };
    const previous: SatelliteObservation = {
      observationId: `DEMO-${randomUUID()}`,
      mode: "DEMO",
      provider: "DEMO/SIMULATED",
      satellite: "Sentinel-1 (simulated)",
      productId: "DEMO-SAR-PREVIOUS-001",
      sceneId: "DEMO-SAR-PREVIOUS-001",
      acquiredAt: previousAcquiredAt,
      aoi: { lat, lon, bbox },
      previewUrl: "/demo/sar/demo-sar-previous.png",
      attribution: "DEMO/SIMULATED — not a live satellite observation — synthetic SAR (previous)",
      metadata: { demoId: "DEMO-SAR-PREVIOUS-001", location: { lat, lon }, bbox, synthetic: true },
      footprint: { bbox, geometry: { type: "Polygon", coordinates: [[[bbox[0], bbox[1]],[bbox[2], bbox[1]],[bbox[2], bbox[3]],[bbox[0], bbox[3]],[bbox[0], bbox[1]]]] } },
    };
    return { current, previous };
  }

  async acquire(input: AcquireInput): Promise<SatelliteObservation> {
    const pair = await this.acquirePair(input);
    return pair.current;
  }
}
