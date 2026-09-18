export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { getDb } = await import("./lib/db/index");
      const { agentRuns } = await import("./lib/db/schema");
      const { inArray, sql } = await import("drizzle-orm");
      const { db } = getDb();
      await db.update(agentRuns).set({ status: "failed", error: "stale: server restart", updatedAt: new Date() }).where(inArray(agentRuns.status, ["queued", "running", "searching", "analyzing", "waiting", "reassessing"]));
    } catch {}
  }
}
