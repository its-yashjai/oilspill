import { createHash } from "crypto";
import { repo, serializeDates, withTransaction, getDb } from "@/lib/db/repo";
import { idempotencyKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface IdempotencyRecord {
  key: string;
  requestHash: string;
  response: Record<string, unknown>;
  endpoint: string;
  createdAt: Date;
  expiresAt: Date;
}

const TTL_MS = 24 * 60 * 60 * 1000;

function hashRequest(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

function generateKey(parts: string[]): string {
  return parts.join(":").toLowerCase();
}

export function buildIdempotencyKey(
  endpoint: string,
  incidentId?: string,
  agentType?: string,
  contextVersion?: number,
  action?: string
): string {
  const parts = ["idem", endpoint];
  if (incidentId) parts.push(incidentId);
  if (agentType) parts.push(agentType);
  if (contextVersion !== undefined) parts.push(`v${contextVersion}`);
  if (action) parts.push(action);
  return generateKey(parts);
}

export async function checkIdempotency(
  key: string,
  requestBody: unknown,
  endpoint: string
): Promise<{ exists: boolean; response?: Record<string, unknown>; conflict?: boolean }> {
  const requestHash = hashRequest(requestBody);
  const existing = await repo.idempotencyKeys.getById(key);
  if (!existing) return { exists: false };
  if (existing.expiresAt && new Date(existing.expiresAt).getTime() < Date.now()) {
    await getDb().db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
    return { exists: false };
  }
  if (existing.requestHash === requestHash) {
    return { exists: true, response: existing.response as Record<string, unknown> };
  }
  return { exists: true, conflict: true };
}

export async function storeIdempotencyResult(
  key: string,
  requestBody: unknown,
  response: Record<string, unknown>,
  endpoint: string
): Promise<void> {
  const requestHash = hashRequest(requestBody);
  const now = new Date();
  const payload = {
    key,
    requestHash,
    response: serializeDates(response) as Record<string, unknown>,
    endpoint,
    createdAt: now,
    expiresAt: new Date(now.getTime() + TTL_MS),
  };
  try {
    await repo.idempotencyKeys.create(payload);
  } catch {
    await getDb().db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
    await repo.idempotencyKeys.create(payload);
  }
}

export async function withIdempotency<T>(
  key: string,
  requestBody: unknown,
  endpoint: string,
  handler: () => Promise<T>
): Promise<T> {
  const requestHash = hashRequest(requestBody);
  const now = new Date();
  try {
    return await withTransaction(async (tx) => {
      const existing = await tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)).limit(1).then((r) => r[0]);
      if (existing) {
        if (existing.expiresAt && new Date(existing.expiresAt).getTime() < Date.now()) {
          await tx.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
        } else if (existing.requestHash === requestHash) {
          return existing.response as unknown as T;
        } else {
          throw new Error("IDEMPOTENCY_CONFLICT: Same key used with different payload");
        }
      }
      const result = await handler();
      const payload = {
        key,
        requestHash,
        response: serializeDates(result as Record<string, unknown>) as Record<string, unknown>,
        endpoint,
        createdAt: now,
        expiresAt: new Date(now.getTime() + TTL_MS),
      };
      await tx.insert(idempotencyKeys).values(payload);
      return result;
    });
  } catch (e) {
    if ((e as Error).message.includes("IDEMPOTENCY_CONFLICT")) throw e;
    if ((e as Error).message.includes("duplicate key") || (e as Error).message.includes("unique")) {
      const existing = await repo.idempotencyKeys.getById(key);
      if (existing && existing.requestHash === requestHash) {
        if (!existing.expiresAt || new Date(existing.expiresAt).getTime() >= Date.now()) {
          return existing.response as unknown as T;
        }
      }
      if (existing) throw new Error("IDEMPOTENCY_CONFLICT: Same key used with different payload");
    }
    throw e;
  }
}

export function getIdempotencyKeyFromRequest(req: Request): string | null {
  return req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key");
}
