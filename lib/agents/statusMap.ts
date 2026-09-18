import type { AgentStatus } from "./types";

export const agentStatusMap: Record<AgentStatus, { label: string; dot: string; color: string }> = {
  searching: { label: "Searching", dot: "🟢", color: "text-emerald-400" },
  analyzing: { label: "Analyzing", dot: "🔵", color: "text-sky-400" },
  waiting: { label: "Waiting", dot: "🟡", color: "text-amber-400" },
  reassessing: { label: "Reassessing", dot: "🟠", color: "text-orange-400" },
  idle: { label: "Idle", dot: "⚪", color: "text-slate-400" },
  error: { label: "Error", dot: "🔴", color: "text-red-400" },
  completed: { label: "Completed", dot: "✅", color: "text-emerald-300" },
};

export function dotColorFromStatus(s: AgentStatus): string {
  switch (s) {
    case "searching": return "#10b981";
    case "analyzing": return "#0ea5e9";
    case "waiting": return "#f59e0b";
    case "reassessing": return "#f97316";
    default: return "#475569";
  }
}
