import { HISTORICAL_SEED, KNOWLEDGE_BASE } from "../db/seed";

export type MossResult = { id: string; score: number; snippet: string; meta: any };

export async function mockSearch(query: string, topK=5): Promise<{results:MossResult[], latencyMs:number}>{
  const t0 = performance.now();
  // artificial latency 5-15ms to mimic real Moss
  await new Promise(r=>setTimeout(r, 5 + Math.floor(Math.random()*8)));
  const q = query.toLowerCase();
  const corpus = [...HISTORICAL_SEED.map(h=>({ id:h.id, text: `${h.region} ${h.description} ${h.detectedCharacteristics.join(" ")}`, meta:h })), ...KNOWLEDGE_BASE.map(k=>({ id:k.id, text: `${k.title} ${k.text}`, meta:k}))];
  const scored = corpus.map(c=>{
    let score=0;
    const tokens = q.split(/\s+/).filter(Boolean);
    for(const tok of tokens) if(c.text.toLowerCase().includes(tok)) score+=0.2;
    // region boost
    if(q.includes("arabian") && c.text.toLowerCase().includes("arabian")) score+=0.3;
    if(q.includes("sar") && c.text.toLowerCase().includes("sar")) score+=0.15;
    // random tie-breaker deterministic on id char code
    score += (c.id.charCodeAt(c.id.length-1)%5)*0.01;
    return { id:c.id, score, snippet: c.text.slice(0,180), meta:c.meta };
  }).sort((a,b)=>b.score-a.score).slice(0, topK).filter(r=>r.score>0.05);
  const latencyMs = Number((performance.now()-t0).toFixed(2));
  return { results: scored as any, latencyMs };
}
