import { getIncidentState } from "@/lib/db/repo";
import { IncidentRoomClient } from "./IncidentRoomClient";
import { notFound } from "next/navigation";

interface IncidentPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: IncidentPageProps) {
  const { id } = await params;
  return {
    title: `BlueSentinel — Incident ${id}`,
    description: `Collaborative incident room for ${id}`,
  };
}

export default async function IncidentPage({ params }: IncidentPageProps) {
  const { id } = await params;
  const state = await getIncidentState(id);
  if (!state) notFound();
  return (
    <IncidentRoomClient
      initialData={{
        mossConfigured: Boolean(process.env.MOSS_PROJECT_ID && process.env.MOSS_PROJECT_KEY),
        incident: state.incident,
        detection: state.detection,
        images: state.images,
        findings: state.findings,
        observations: state.observations,
        timeline: state.timeline,
        contextVersions: state.contextVersions,
        disagreements: state.disagreements,
        gaps: state.gaps,
        agentRuns: (state as any).agentRuns || [],
      }}
    />
  );
}
