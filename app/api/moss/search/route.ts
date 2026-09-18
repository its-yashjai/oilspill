import { NextRequest, NextResponse } from "next/server";
import { searchMoss } from "@/lib/moss/client";
export async function POST(req: NextRequest){
  const body = await req.json().catch(()=>({}));
  const query = (body.query||"").toString().slice(0,500);
  if(!query) return NextResponse.json({ error:"query required"},{status:400});
  const { results, metrics } = await searchMoss(query, body.reason||"ui_search");
  return NextResponse.json({ results, metrics });
}
