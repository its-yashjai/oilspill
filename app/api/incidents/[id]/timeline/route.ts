import { NextRequest, NextResponse } from "next/server";
import { repo, serializeDates } from "@/lib/db/repo";
export async function GET(_:NextRequest, { params }:{ params:Promise<{id:string}>}){
  const { id } = await params;
  const timeline = await repo.timelineEvents.listByIncident(id);
  return NextResponse.json({ timeline: serializeDates([...timeline].sort((a:any,b:any)=> new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime())) });
}
