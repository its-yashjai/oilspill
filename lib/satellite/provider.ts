import type { SatelliteProvider } from "./types";
import { DemoSatelliteProvider } from "./demoProvider";
import { LiveSentinel1Provider } from "./liveSentinel1Provider";

export function getSatelliteProvider(mode: "DEMO" | "LIVE"): SatelliteProvider {
  return mode === "LIVE" ? new LiveSentinel1Provider() : new DemoSatelliteProvider();
}
export function getLiveConfigStatus() {
  return new LiveSentinel1Provider().configStatus();
}
