import { pgTable, text, timestamp, integer, jsonb, boolean, uuid, real, index } from "drizzle-orm/pg-core";

export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(),
  region: text("region").notNull(),
  location: jsonb("location").$type<{ lat: number; lon: number; label: string }>().notNull(),
  status: text("status").notNull().default("open"), // open, investigating, escalated, resolved, low_concern
  severity: text("severity").notNull().default("unresolved"), // low, unresolved, elevated
  contextVersion: integer("context_version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: text("created_by").default("demo-operator"),
});

export const incidentImages = pgTable("incident_images", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  sourceType: text("source_type").notNull(), // DEMO, USER_UPLOAD, LIVE
  url: text("url").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("incident_images_incident_id_idx").on(t.incidentId)]);

export const detectionRuns = pgTable("detection_runs", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  anomalyDetected: boolean("anomaly_detected").notNull(),
  confidence: real("confidence").notNull(),
  affectedAreaEstimate: real("affected_area_estimate"),
  location: jsonb("location").$type<{ lat: number; lon: number }>(),
  detectionMethod: text("detection_method").notNull(),
  sourceImageId: text("source_image_id"),
  comparisonImageId: text("comparison_image_id"),
  rawResult: jsonb("raw_result").$type<Record<string, unknown>>(),
  processingLatencyMs: integer("processing_latency_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("detection_runs_incident_id_idx").on(t.incidentId)]);

export const agentRuns = pgTable("agent_runs", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  agentType: text("agent_type").notNull(), // historical, investigation, evidence
  status: text("status").notNull(), // searching, analyzing, waiting, reassessing, idle, error, completed
  latencyMs: integer("latency_ms"),
  contextVersion: integer("context_version"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("agent_runs_incident_id_idx").on(t.incidentId),
  index("agent_runs_incident_context_idx").on(t.incidentId, t.contextVersion),
]);

export const findings = pgTable("findings", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  agentType: text("agent_type").notNull(),
  summary: text("summary").notNull(),
  confidence: real("confidence").notNull(),
  supportingEvidence: jsonb("supporting_evidence").$type<string[]>(),
  contradictoryEvidence: jsonb("contradictory_evidence").$type<string[]>(),
  informationNeeded: jsonb("information_needed").$type<string[]>(),
  mossEvidenceIds: jsonb("moss_evidence_ids").$type<string[]>(),
  contextVersion: integer("context_version").notNull(),
  dependsOn: jsonb("depends_on").$type<string[]>(),
  status: text("status").notNull().default("active"), // active, stale, superseded
  mossLatencyMs: integer("moss_latency_ms"),
  raw: jsonb("raw").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("findings_incident_id_idx").on(t.incidentId),
  index("findings_incident_context_idx").on(t.incidentId, t.contextVersion),
]);

export const historicalIncidents = pgTable("historical_incidents", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  region: text("region").notNull(),
  coordinates: jsonb("coordinates").$type<{ lat: number; lon: number }>().notNull(),
  description: text("description").notNull(),
  source: text("source"),
  environmentalConditions: jsonb("environmental_conditions").$type<Record<string, unknown>>(),
  detectedCharacteristics: jsonb("detected_characteristics").$type<string[]>(),
  resolution: text("resolution"),
  sourceUrl: text("source_url"),
  confidence: real("confidence"),
});

export const observations = pgTable("observations", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  author: text("author").notNull(),
  authorType: text("author_type").notNull(), // human, agent
  text: text("text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("observations_incident_id_idx").on(t.incidentId)]);

export const timelineEvents = pgTable("timeline_events", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("timeline_events_incident_id_idx").on(t.incidentId)]);

export const contextVersions = pgTable("context_versions", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("context_versions_incident_id_idx").on(t.incidentId),
  index("context_versions_incident_version_idx").on(t.incidentId, t.version),
]);

export const agentDisagreements = pgTable("agent_disagreements", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  contextVersion: integer("context_version").notNull(),
  reason: text("reason").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("agent_disagreements_incident_id_idx").on(t.incidentId)]);

export const informationGaps = pgTable("information_gaps", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  contextVersion: integer("context_version").notNull(),
  gaps: jsonb("gaps").$type<string[]>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("information_gaps_incident_id_idx").on(t.incidentId)]);

export const humanDecisions = pgTable("human_decisions", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  action: text("action").notNull(), // add_observation, request_evidence, mark_low_concern, escalate, resolve
  reasoning: text("reasoning"),
  contextVersion: integer("context_version").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("human_decisions_incident_id_idx").on(t.incidentId)]);

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull(), // sent, logged, failed
  toEmail: text("to_email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("notifications_incident_id_idx").on(t.incidentId)]);

export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => incidents.id),
  markdown: text("markdown").notNull(),
  json: jsonb("json").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("reports_incident_id_idx").on(t.incidentId)]);

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  requestHash: text("request_hash").notNull(),
  response: jsonb("response").$type<Record<string, unknown>>().notNull(),
  endpoint: text("endpoint").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});
