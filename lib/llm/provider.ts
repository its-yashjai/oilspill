export type LLMResult = { text: string; json?: any; latencyMs: number; tokens?: number; mode: "real"|"fallback" };

function getLLMConfig() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || process.env.API_KEY;
  const baseURL = process.env.LLM_BASE_URL || process.env.API_BASE_URL;
  const model = process.env.LLM_MODEL || process.env.API_MODEL || "gpt-4o-mini";
  return { apiKey, baseURL, model };
}

export async function synthesize(prompt: { system: string; user: string; schemaHint?: string }): Promise<LLMResult>{
  const { apiKey, baseURL, model } = getLLMConfig();
  const t0 = performance.now();
  if(apiKey){
    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({ apiKey, baseURL });
      const res = await client.chat.completions.create({
        model,
        messages: [{ role:"system", content: prompt.system }, { role:"user", content: prompt.user }],
        temperature: 0.2,
        response_format: { type: "json_object" } as any,
      });
      const text = res.choices[0]?.message?.content || "{}";
      let json: any = undefined;
      try { json = JSON.parse(text); } catch{}
      const latencyMs = Math.round(performance.now()-t0);
      return { text, json, latencyMs, tokens: res.usage?.total_tokens, mode:"real" };
    } catch(e:any){
      // fall through to mock
    }
  }
  // mock synthesis — deterministic template based on prompt
  await new Promise(r=>setTimeout(r, 400 + Math.floor(Math.random()*300)));
  const latencyMs = Math.round(performance.now()-t0);
  // Return empty to let caller use template fallback
  return { text: "{}", latencyMs, mode:"fallback" };
}

export function isLLMConfigured(): boolean {
  return !!getLLMConfig().apiKey;
}
