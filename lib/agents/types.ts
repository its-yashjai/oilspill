export type AgentType = "historical" | "investigation" | "evidence";
export type Finding = {
  id: string;
  incidentId: string;
  agentType: AgentType;
  summary: string;
  confidence: number;
  supportingEvidence: string[];
  contradictoryEvidence: string[];
  informationNeeded: string[];
  mossEvidenceIds: string[];
  contextVersion: number;
  dependsOn: string[];
  status: "active"|"stale"|"superseded";
  mossLatencyMs?: number;
  createdAt: string;
  raw?: any;
};
export type AgentStatus = "searching"|"analyzing"|"waiting"|"reassessing"|"idle"|"error"|"completed";
