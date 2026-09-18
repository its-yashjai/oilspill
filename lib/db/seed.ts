import type { DbExecutor } from "./index";

export const HISTORICAL_SEED = [
  {
    id: "HIST-001",
    date: "2021-03-14",
    region: "Arabian Sea",
    coordinates: { lat: 19.2, lon: 64.5 },
    description: "Dark elongated anomaly off Mumbai coast, 23 km slick, moderate wind 12 knots, later confirmed as bilge discharge.",
    source: "ISRO Bhuvan + Sentinel-1",
    environmentalConditions: { wind: "12 knots NE", current: "0.8 m/s west", sst: "27C" },
    detectedCharacteristics: ["elongated dark patch", "feathered edges", "wind-aligned"],
    resolution: "Confirmed bilge discharge, containment deployed",
    sourceUrl: "https://example.gov/hist-001",
    confidence: 0.87,
  },
  {
    id: "HIST-002",
    date: "2022-08-09",
    region: "Persian Gulf",
    coordinates: { lat: 26.8, lon: 52.3 },
    description: "Circular dark anomaly near shipping lane, initially flagged as spill, later identified as algal bloom.",
    source: "ESA Copernicus",
    environmentalConditions: { wind: "5 knots calm", chlorophyll: "high" },
    detectedCharacteristics: ["circular", "low contrast", "no wind streak"],
    resolution: "False positive — algal bloom",
    sourceUrl: "https://example.gov/hist-002",
    confidence: 0.72,
  },
  {
    id: "HIST-003",
    date: "2020-11-02",
    region: "Arabian Sea",
    coordinates: { lat: 20.1, lon: 65.8 },
    description: "Wind-aligned dark slick 15 km, strong SAR damping, confirmed crude spill from tanker leak.",
    source: "Sentinel-1 SAR",
    environmentalConditions: { wind: "15 knots SW", wave: "1.2m" },
    detectedCharacteristics: ["SAR damping", "linear", "high contrast"],
    resolution: "Confirmed crude spill — escalated, cleanup 14 days",
    sourceUrl: "https://example.gov/hist-003",
    confidence: 0.93,
  },
  {
    id: "HIST-004",
    date: "2023-01-18",
    region: "Bay of Bengal",
    coordinates: { lat: 16.4, lon: 82.1 },
    description: "Patchy dark regions during monsoon, low confidence, insufficient temporal confirmation.",
    source: "ISS imagery",
    environmentalConditions: { wind: "unknown", cloud: "80%" },
    detectedCharacteristics: ["patchy", "cloud shadow contamination"],
    resolution: "Unresolved — insufficient evidence",
    sourceUrl: "https://example.gov/hist-004",
    confidence: 0.51,
  },
  {
    id: "HIST-005",
    date: "2019-06-30",
    region: "Arabian Sea",
    coordinates: { lat: 18.9, lon: 63.2 },
    description: "Narrow dark filament 8 km, low wind, confirmed natural seep.",
    source: "NOAA",
    environmentalConditions: { wind: "6 knots", seepHistorical: true },
    detectedCharacteristics: ["filament", "persistent location"],
    resolution: "Natural seep — monitoring only",
    sourceUrl: "https://example.gov/hist-005",
    confidence: 0.68,
  },
  {
    id: "HIST-006",
    date: "2022-12-11",
    region: "Gulf of Oman",
    coordinates: { lat: 24.5, lon: 58.9 },
    description: "Dark anomaly with vessel nearby, high SAR contrast, confirmed operational discharge.",
    source: "Sentinel-1 + AIS",
    environmentalConditions: { wind: "10 knots", vesselPresent: true },
    detectedCharacteristics: ["vessel proximity", "fresh edges"],
    resolution: "Operational discharge — flagged to authority",
    sourceUrl: "https://example.gov/hist-006",
    confidence: 0.89,
  },
].map((record) => ({
  ...record,
  description: `Synthetic demo scenario; not verified historical evidence. ${record.description}`,
  source: "DEMO_SYNTHETIC",
  sourceUrl: null,
  resolution: `Fictional demo outcome: ${record.resolution}`,
  environmentalConditions: {
    ...record.environmentalConditions,
    provenance: "synthetic_demo",
    verifiedHistoricalRecord: false,
  },
}));

export const KNOWLEDGE_BASE = [
  { id: "KB-001", title: "SAR Oil Detection — Wind Window", text: "SAR detection of oil is most reliable at 3-10 m/s wind. Calm (<3 m/s) causes look-alikes; high wind (>10 m/s) disperses slick." },
  { id: "KB-002", title: "Visual vs SAR Confirmation", text: "Single optical image without temporal change detection or SAR damping is insufficient for confirmation. Require second temporal observation." },
  { id: "KB-003", title: "Response Guidance — Elevated Concern", text: "Elevated concern requires: affected area >5 km, confidence >0.75, historical similarity >0.7, and at least one corroborating source. Then escalate to authority." },
  { id: "KB-004", title: "Look-alikes", text: "Algal blooms, cloud shadows, low-wind dark patches, and natural seeps mimic spills. Check chlorophyll, cloud mask, wind history." },
  { id: "KB-005", title: "Evidence Quality", text: "Assess completeness: imagery, wind/current, temporal pair, AIS vessel data. Mark findings stale if gaps filled." },
];

export async function seedHistoricalIncidents(tx?: DbExecutor): Promise<number> {
  const { getDb } = await import("./index");
  const { historicalIncidents } = await import("./schema");
  const rows = await (tx ?? getDb().db).insert(historicalIncidents)
    .values(HISTORICAL_SEED)
    .onConflictDoNothing({ target: historicalIncidents.id })
    .returning({ id: historicalIncidents.id });
  return rows.length;
}

async function main(): Promise<void> {
  const { closeDb } = await import("./index");
  try {
    const count = await seedHistoricalIncidents();
    console.log(`[seed] inserted ${count} synthetic demo scenarios; not verified history`);
  } catch {
    console.error("[seed] failed; connection details withheld");
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && /(?:^|[/\\])seed\.(?:ts|js)$/.test(process.argv[1])) {
  void main().catch(() => {
    console.error("[seed] shutdown failed");
    process.exitCode = 1;
  });
}
