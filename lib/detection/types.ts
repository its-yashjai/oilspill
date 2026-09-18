export type DetectionResult = {
  anomalyDetected: boolean;
  confidence: number;
  affectedAreaEstimate: number; // percent 0-100
  location: { lat: number; lon: number; label: string };
  detectionMethod: string;
  sourceImageId: string;
  comparisonImageId: string;
  timestamp: string;
  raw?: Record<string, unknown>;
  processingLatencyMs: number;
};
