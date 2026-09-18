export function measure<T>(fn: ()=>Promise<T>): Promise<{ result:T; latencyMs:number }>{
  const t0 = performance.now();
  return fn().then(result=>({ result, latencyMs: Math.round(performance.now()-t0)}));
}
export const metrics = { requests:0, mossTotalMs:0, agentTotalMs:0, llmTotalMs:0 };
