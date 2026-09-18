import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, lt, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import {
  incidents,
  incidentImages,
  detectionRuns,
  agentRuns,
  findings,
  historicalIncidents,
  observations,
  timelineEvents,
  contextVersions,
  agentDisagreements,
  informationGaps,
  humanDecisions,
  notifications,
  reports,
  idempotencyKeys,
} from "./schema";
import { getDb, withTransaction, type DbExecutor, type DbTransaction } from "./index";
export { getDb, getMode, getPgClient, getPgliteClient, withTransaction, closeDb } from "./index";
export type { DbExecutor, DbTransaction, DbMode, DbTransactionConfig, TransactionFn } from "./index";

export type Tx = DbExecutor | DbTransaction;

export interface TableRepository<T extends PgTable> {
  create(values: T["$inferInsert"], tx?: Tx): Promise<T["$inferSelect"]>;
  getById(id: string, tx?: Tx): Promise<T["$inferSelect"] | null>;
  list(tx?: Tx): Promise<T["$inferSelect"][]>;
  listWhere(where: SQL, tx?: Tx): Promise<T["$inferSelect"][]>;
  update(id: string, values: Partial<Omit<T["$inferInsert"], "id" | "key">>, tx?: Tx): Promise<T["$inferSelect"] | null>;
  delete(id: string, tx?: Tx): Promise<boolean>;
}

function tableRepository<T extends PgTable>(table: T, key: PgColumn, order: PgColumn = key): TableRepository<T> {
  const source: PgTable = table;
  const listWhere = async (where?: SQL, tx?: Tx): Promise<T["$inferSelect"][]> =>
    resolveExecutor(tx).select().from(source).where(where).orderBy(asc(order), asc(key)) as Promise<T["$inferSelect"][]>;
  return {
    async create(values, tx) {
      const [row] = await resolveExecutor(tx).insert(table).values(values).returning();
      return row as T["$inferSelect"];
    },
    async getById(id, tx) {
      const [row] = await resolveExecutor(tx).select().from(source).where(eq(key, id)).limit(1);
      return (row as T["$inferSelect"] | undefined) ?? null;
    },
    list: (tx) => listWhere(undefined, tx),
    listWhere,
    async update(id, values, tx) {
      const [row] = await resolveExecutor(tx).update(source).set(values as PgUpdateSetSource<PgTable>).where(eq(key, id)).returning();
      return (row as T["$inferSelect"] | undefined) ?? null;
    },
    async delete(id, tx) {
      const rows = await resolveExecutor(tx).delete(table).where(eq(key, id)).returning();
      return rows.length > 0;
    },
  };
}

function incidentRepository<T extends PgTable>(table: T, key: PgColumn, incidentId: PgColumn, createdAt: PgColumn) {
  const repository = tableRepository(table, key, createdAt);
  return {
    ...repository,
    listByIncident: (id: string, tx?: Tx) => repository.listWhere(eq(incidentId, id), tx),
  };
}

export type Incident = typeof incidents.$inferSelect;
export type NewIncident = typeof incidents.$inferInsert;
export type IncidentImage = typeof incidentImages.$inferSelect;
export type NewIncidentImage = typeof incidentImages.$inferInsert;
export type DetectionRun = typeof detectionRuns.$inferSelect;
export type NewDetectionRun = typeof detectionRuns.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;
export type HistoricalIncident = typeof historicalIncidents.$inferSelect;
export type NewHistoricalIncident = typeof historicalIncidents.$inferInsert;
export type Observation = typeof observations.$inferSelect;
export type NewObservation = typeof observations.$inferInsert;
export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type NewTimelineEvent = typeof timelineEvents.$inferInsert;
export type ContextVersion = typeof contextVersions.$inferSelect;
export type NewContextVersion = typeof contextVersions.$inferInsert;
export type AgentDisagreement = typeof agentDisagreements.$inferSelect;
export type NewAgentDisagreement = typeof agentDisagreements.$inferInsert;
export type InformationGap = typeof informationGaps.$inferSelect;
export type NewInformationGap = typeof informationGaps.$inferInsert;
export type HumanDecision = typeof humanDecisions.$inferSelect;
export type NewHumanDecision = typeof humanDecisions.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;

export type IsoDates<T> = T extends Date ? string : T extends readonly (infer U)[] ? IsoDates<U>[] : T extends object ? { [K in keyof T]: IsoDates<T[K]> } : T;

export function serializeDates<T>(value: T): IsoDates<T> {
  if (value instanceof Date) return value.toISOString() as IsoDates<T>;
  if (Array.isArray(value)) return value.map(serializeDates) as IsoDates<T>;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeDates(item)])) as IsoDates<T>;
  }
  return value as IsoDates<T>;
}

function resolveExecutor(tx?: Tx): DbExecutor {
  return (tx ?? getDb().db) as DbExecutor;
}

export const incidentImagesRepo = incidentRepository(incidentImages, incidentImages.id, incidentImages.incidentId, incidentImages.createdAt);
export const detectionRunsRepo = incidentRepository(detectionRuns, detectionRuns.id, detectionRuns.incidentId, detectionRuns.createdAt);
export const agentRunsRepo = incidentRepository(agentRuns, agentRuns.id, agentRuns.incidentId, agentRuns.createdAt);
export const findingsRepo = incidentRepository(findings, findings.id, findings.incidentId, findings.createdAt);
export const historicalIncidentsRepo = tableRepository(historicalIncidents, historicalIncidents.id, historicalIncidents.date);
export const observationsRepo = incidentRepository(observations, observations.id, observations.incidentId, observations.createdAt);
export const timelineEventsRepo = incidentRepository(timelineEvents, timelineEvents.id, timelineEvents.incidentId, timelineEvents.createdAt);
export const contextVersionsRepo = incidentRepository(contextVersions, contextVersions.id, contextVersions.incidentId, contextVersions.createdAt);
export const agentDisagreementsRepo = incidentRepository(agentDisagreements, agentDisagreements.id, agentDisagreements.incidentId, agentDisagreements.createdAt);
export const informationGapsRepo = incidentRepository(informationGaps, informationGaps.id, informationGaps.incidentId, informationGaps.createdAt);
export const humanDecisionsRepo = incidentRepository(humanDecisions, humanDecisions.id, humanDecisions.incidentId, humanDecisions.createdAt);
export const notificationsRepo = incidentRepository(notifications, notifications.id, notifications.incidentId, notifications.createdAt);
export const reportsRepo = incidentRepository(reports, reports.id, reports.incidentId, reports.createdAt);
export const idempotencyKeysRepo = tableRepository(idempotencyKeys, idempotencyKeys.key, idempotencyKeys.createdAt);

export const incidentsRepo = {
  ...tableRepository(incidents, incidents.id, incidents.createdAt),
  async create(values: NewIncident, tx?: Tx): Promise<Incident> {
    const [row] = await resolveExecutor(tx).insert(incidents).values(values).returning();
    return row;
  },
  async getById(id: string, tx?: Tx): Promise<Incident | null> {
    const [row] = await resolveExecutor(tx).select().from(incidents).where(eq(incidents.id, id));
    return row ? row : null;
  },
  async list(tx?: Tx): Promise<Incident[]> {
    const rows = await resolveExecutor(tx).select().from(incidents).orderBy(desc(incidents.createdAt));
    return rows;
  },
  async update(id: string, values: Partial<NewIncident>, tx?: Tx): Promise<Incident | null> {
    const [row] = await resolveExecutor(tx)
      .update(incidents)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(incidents.id, id))
      .returning();
    return row ? row : null;
  },
  async delete(id: string, tx?: Tx): Promise<boolean> {
    const rows = await resolveExecutor(tx)
      .delete(incidents)
      .where(eq(incidents.id, id))
      .returning({ id: incidents.id });
    return rows.length > 0;
  },
};

export const repo = {
  incidents: incidentsRepo,
  incidentImages: incidentImagesRepo,
  detectionRuns: detectionRunsRepo,
  agentRuns: agentRunsRepo,
  findings: findingsRepo,
  historicalIncidents: historicalIncidentsRepo,
  observations: observationsRepo,
  timelineEvents: timelineEventsRepo,
  contextVersions: contextVersionsRepo,
  agentDisagreements: agentDisagreementsRepo,
  informationGaps: informationGapsRepo,
  humanDecisions: humanDecisionsRepo,
  notifications: notificationsRepo,
  reports: reportsRepo,
  idempotencyKeys: idempotencyKeysRepo,
};

export const createIncident = incidentsRepo.create;
export const getIncident = incidentsRepo.getById;
export const listIncidents = incidentsRepo.list;
export const updateIncident = incidentsRepo.update;
export const deleteIncident = incidentsRepo.delete;

async function readIncidentState(id: string, tx: Tx) {
  const incident = await getIncident(id, tx);
  if (!incident) return null;
  const detections = await detectionRunsRepo.listByIncident(id, tx);
  const reportRows = await reportsRepo.listByIncident(id, tx);
  return serializeDates({
    incident,
    detection: detections.at(-1) ?? null,
    detections,
    findings: await findingsRepo.listByIncident(id, tx),
    observations: await observationsRepo.listByIncident(id, tx),
    timeline: await timelineEventsRepo.listByIncident(id, tx),
    gaps: await informationGapsRepo.listByIncident(id, tx),
    disagreements: await agentDisagreementsRepo.listByIncident(id, tx),
    contextVersions: await contextVersionsRepo.listByIncident(id, tx),
    images: await incidentImagesRepo.listByIncident(id, tx),
    decisions: await humanDecisionsRepo.listByIncident(id, tx),
    reports: reportRows.at(-1) ?? null,
    reportHistory: reportRows,
    notifications: await notificationsRepo.listByIncident(id, tx),
    agentRuns: await agentRunsRepo.listByIncident(id, tx),
  });
}

export type IncidentState = NonNullable<Awaited<ReturnType<typeof readIncidentState>>>;

export async function getIncidentState(id: string, tx?: Tx): Promise<IncidentState | null> {
  if (tx) return readIncidentState(id, tx);
  return withTransaction((transaction) => readIncidentState(id, transaction), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

export async function incrementContext(
  incidentId: string,
  snapshot: Record<string, unknown>,
  tx?: DbTransaction
): Promise<number> {
  const increment = async (transaction: DbTransaction): Promise<number> => {
    const [incident] = await transaction.update(incidents)
      .set({ contextVersion: sql`${incidents.contextVersion} + 1`, updatedAt: new Date() })
      .where(eq(incidents.id, incidentId)).returning();
    if (!incident) throw new Error("incident not found");
    await contextVersionsRepo.create({
      id: randomUUID(), incidentId, version: incident.contextVersion, snapshot,
    }, transaction);
    const candidates = await transaction.select().from(findings).where(and(
      eq(findings.incidentId, incidentId), eq(findings.status, "active"),
      lt(findings.contextVersion, incident.contextVersion)
    ));
    const snapshotText = JSON.stringify(snapshot).toLowerCase();
    const stale: string[] = [];
    for (const finding of candidates) {
      const dependencies = (finding.dependsOn ?? []).join(" ").toLowerCase();
      if (["wind", "temporal"].some((key) => dependencies.includes(key) && snapshotText.includes(key))) {
        await findingsRepo.update(finding.id, { status: "stale" }, transaction);
        stale.push(finding.id);
      }
    }
    await timelineEventsRepo.create({
      id: randomUUID(), incidentId, type: "context_updated",
      payload: { version: incident.contextVersion, snapshot },
    }, transaction);
    if (stale.length) await timelineEventsRepo.create({
      id: randomUUID(), incidentId, type: "finding_stale", payload: { stale },
    }, transaction);
    return incident.contextVersion;
  };
  return tx ? increment(tx) : withTransaction(increment);
}
