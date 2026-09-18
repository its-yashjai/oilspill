"""
benchmark_agents.py — 3-agent pipeline timing + parallelism verification
Flow: Historical + Investigation -> Evidence
Measures initial response vs pipeline completion via polling agent_runs/timeline
"""
import asyncio
import os
import sys
import time
import json
import uuid
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from benchmark_utils import save_results, print_stats, DEFAULT_BASE_URL

BASE_URL = os.environ.get("BLUESENTINEL_BASE_URL", DEFAULT_BASE_URL)
ENV = os.environ.get("BENCH_ENV", "local")

import httpx

async def create_demo_incident_and_poll():
    incident_id = f"perf-agent-{uuid.uuid4().hex[:8]}"
    print(f"\n=== Agent Pipeline: {incident_id} (Historical + Investigation -> Evidence) ===")
    t0_all = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            t0 = time.perf_counter()
            r = await client.post(BASE_URL + "/api/incidents", json={"id": incident_id, "region": "Arabian Sea", "location": {"lat": 19.2, "lon": 64.5, "label": "Arabian Sea"}, "mode": "DEMO", "sourceImageId": "DEMO-SAR-001"})
            initial_latency = (time.perf_counter()-t0)*1000
            if not (200 <= r.status_code < 400):
                print(f"Create failed {r.status_code} {r.text[:300]}")
                save_results("agent_pipeline_create_failed", ENV, {"error": r.text[:300], "status": r.status_code, "base_url": BASE_URL})
                return None
            print(f"Initial API response (202): {initial_latency:.1f}ms — background pipeline started")
            # Poll for pipeline completion
            # need to poll GET /api/incidents/[id] for agentRuns
            hist_done = None
            inv_done = None
            ev_done = None
            total_done = None
            start_poll = time.perf_counter()
            # Poll up to 40s
            last_status = {}
            for attempt in range(40):
                await asyncio.sleep(1.0)
                try:
                    pr = await client.get(BASE_URL + f"/api/incidents/{incident_id}", timeout=10)
                    if pr.status_code != 200:
                        continue
                    j = pr.json()
                    runs = j.get("agentRuns") or j.get("agent_runs") or []
                    # also check timeline?
                    # Determine status per agent
                    def status_of(agentType):
                        r = next((x for x in runs if x.get("agentType")==agentType or x.get("agent_type")==agentType), None)
                        return r.get("status") if r else "unknown"
                    hs = status_of("historical")
                    is_ = status_of("investigation")
                    es = status_of("evidence")
                    # Log if changed
                    if (hs, is_, es) != last_status.get("tuple"):
                        print(f"  poll {attempt+1}: historical={hs} investigation={is_} evidence={es}")
                        last_status["tuple"] = (hs, is_, es)
                    now = (time.perf_counter() - start_poll)*1000
                    if hs == "completed" and hist_done is None:
                        hist_done = now
                    if is_ == "completed" and inv_done is None:
                        inv_done = now
                    if es == "completed" and ev_done is None:
                        ev_done = now
                    if hs in ("completed","failed") and is_ in ("completed","failed") and es in ("completed","failed"):
                        total_done = now
                        break
                    if es == "completed":
                        # Even if hist/inv failed, evidence completed means pipeline done
                        if total_done is None and hs in ("completed","failed") and is_ in ("completed","failed"):
                            total_done = now
                            break
                except Exception as e:
                    print(f"  poll error {e}")
                    continue
            total_pipeline = (time.perf_counter() - t0_all)*1000 if total_done else None
            print(f"Hist done: {hist_done}ms, Inv done: {inv_done}ms, Ev done: {ev_done}ms, Total pipeline: {total_done}ms (from poll start), initial={initial_latency:.1f}ms")
            # Parallelism check: sequential theoretical = hist+inv avg vs parallel max
            if hist_done is not None and inv_done is not None:
                sequential = hist_done + inv_done  # if sequential, would be sum from start? Actually hist and inv start same time, sequential would be sum
                parallel = max(hist_done, inv_done)
                print(f"Parallelism: sequential theoretical ~{sequential:.0f}ms vs parallel max({hist_done:.0f},{inv_done:.0f})={parallel:.0f}ms (should be ~max, not sum)")
                is_parallel = parallel < (sequential * 0.8)  # should be significantly less than sum
                print(f"Parallelism verification: {'PASS historical+investigation concurrent' if is_parallel else 'FAIL or inconclusive'}")
            # Save
            result = {
                "incident_id": incident_id,
                "initial_response_ms": initial_latency,
                "historical_done_ms": hist_done,
                "investigation_done_ms": inv_done,
                "evidence_done_ms": ev_done,
                "total_pipeline_ms": total_done,
                "base_url": BASE_URL,
            }
            save_results("agent_pipeline_single", ENV, result)
            # Cleanup
            try:
                await client.delete(BASE_URL + f"/api/incidents/{incident_id}")
            except: pass
            return result
    except Exception as e:
        print(f"Agent pipeline bench failed (server not running?): {e}")
        save_results("agent_pipeline_error", ENV, {"error": str(e)[:300], "base_url": BASE_URL})
        return None

async def bench_parallelism_multiple():
    # Run 3 incidents sequentially to gather multiple samples for parallelism verification
    print("\n=== Parallelism verification (3 sequential pipelines) ===")
    samples = []
    for i in range(3):
        res = await create_demo_incident_and_poll()
        if res:
            samples.append(res)
        await asyncio.sleep(1)
    if samples:
        # Aggregate
        hist_vals = [s["historical_done_ms"] for s in samples if s["historical_done_ms"] is not None]
        inv_vals = [s["investigation_done_ms"] for s in samples if s["investigation_done_ms"] is not None]
        ev_vals = [s["evidence_done_ms"] for s in samples if s["evidence_done_ms"] is not None]
        total_vals = [s["total_pipeline_ms"] for s in samples if s["total_pipeline_ms"] is not None]
        from benchmark_utils import compute_stats
        print(f"\nAggregated over {len(samples)} pipelines:")
        if hist_vals:
            hs = compute_stats(hist_vals)
            print(f" Historical p50={hs['p50']:.0f} p95={hs['p95']:.0f} avg={hs['avg']:.0f}")
        if inv_vals:
            ist = compute_stats(inv_vals)
            print(f" Investigation p50={ist['p50']:.0f} p95={ist['p95']:.0f} avg={ist['avg']:.0f}")
        if ev_vals:
            es = compute_stats(ev_vals)
            print(f" Evidence p50={es['p50']:.0f} p95={es['p95']:.0f} avg={es['avg']:.0f}")
        if total_vals:
            ts = compute_stats(total_vals)
            print(f" Total pipeline p50={ts['p50']:.0f} p95={ts['p95']:.0f} avg={ts['avg']:.0f}")
            save_results("agent_pipeline_aggregate", ENV, {"historical": hs if hist_vals else {}, "investigation": ist if inv_vals else {}, "evidence": es if ev_vals else {}, "total": ts, "base_url": BASE_URL})
    return samples

async def main():
    print(f"BASE_URL={BASE_URL} ENV={ENV}")
    print("=== Agent Pipeline Benchmark (3-agent, background) ===")
    print("Flow: Historical + Investigation (parallel) -> Evidence")
    await bench_parallelism_multiple()
    print("\nAgent benchmarks done.")

if __name__ == "__main__":
    asyncio.run(main())
