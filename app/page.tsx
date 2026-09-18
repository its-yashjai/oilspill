import "./globals.css";
import { repo, serializeDates } from "@/lib/db/repo";
import { HomeClient } from "./HomeClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  let incidents: any[] = [];
  try {
    incidents = serializeDates(await repo.incidents.list()) as any[];
  } catch {
    incidents = [];
  }
  return <HomeClient initialIncidents={incidents} />;
}
