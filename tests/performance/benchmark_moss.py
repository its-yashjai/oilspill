"""
benchmark_moss.py — Moss retrieval latency measured separately from end-to-end.
Clearly labels Moss retrieval vs total API latency.
"""
import asyncio
import os
import sys
import time
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from benchmark_utils import run_concurrent_test, save_results, print_stats, DEFAULT_BASE_URL, DETERMINISTIC_MOSS_QUERIES

BASE_URL = os.environ.get("BLUESENTINEL_BASE_URL", DEFAULT_BASE_URL)
ENV = os.environ.get("BENCH_ENV", "local")


async def bench_moss_endpoint():
    # Use deterministic queries, controlled limits (avoid pg saturation)
    scenarios = [
        ("moss_1c_10r", 1, 10),
        ("moss_3c_15r", 3, 15),
        ("moss_5c_20r", 5, 20),
    ]
    for name, conc, total in scenarios:
        # We need to cycle through deterministic queries
        # run_concurrent_test uses single body; we'll instead do manual loop to vary query
        # For simplicity, use first query for this scenario; deterministic
        body = {"query": DETERMINISTIC_MOSS_QUERIES[0], "reason": "benchmark", "limit": 5}
        stats = await run_concurrent_test(BASE_URL, "POST", "/api/moss/search", conc, total, json_body=body)
        stats["path"] = "/api/moss/search"
        stats["base_url"] = BASE_URL
        stats["query"] = body["query"]
        print_stats(name + " (Moss retrieval + API overhead)", stats)
        save_results(f"moss_{conc}c", ENV, stats, {"scenario": name, "moss_query": body["query"]})
        await asyncio.sleep(0.2)

async def bench_moss_varied_queries():
    # Measure with each deterministic query once, low concurrency to isolate per-query variance
    import httpx
    latencies = []
    moss_latencies = []
    errors = 0
    print("\n=== Moss varied queries (sequential, measure moss_latency field) ===")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            for q in DETERMINISTIC_MOSS_QUERIES:
                t0 = time.perf_counter()
                r = await client.post(BASE_URL + "/api/moss/search", json={"query": q, "reason": "benchmark_varied"})
                total = (time.perf_counter()-t0)*1000
                latencies.append(total)
                if 200 <= r.status_code < 400:
                    try:
                        data = r.json()
                        m = data.get("metrics", {})
                        ml = m.get("latencyMs") or m.get("latency") or 0
                        moss_latencies.append(float(ml))
                        print(f"  query='{q[:40]}' total={total:.1f}ms moss={ml}ms mode={m.get('mode')} status={r.status_code}")
                    except:
                        print(f"  query='{q[:30]}' total={total:.1f}ms (no metrics) status={r.status_code}")
                else:
                    errors += 1
                    print(f"  query='{q[:30]}' FAILED {r.status_code} total={total:.1f}ms")
                await asyncio.sleep(0.1)
    except Exception as e:
        print(f"Varied query bench failed (server not running?): {e}")
        save_results("moss_varied_error", ENV, {"error": str(e)[:300], "base_url": BASE_URL})
        return
    # Compute stats separately for total vs moss
    from benchmark_utils import compute_stats
    total_stats = compute_stats(latencies)
    moss_stats = compute_stats(moss_latencies)
    print(f"\nTotal API latency: p50={total_stats['p50']:.1f} p95={total_stats['p95']:.1f} avg={total_stats['avg']:.1f}")
    print(f"Moss retrieval latency: p50={moss_stats['p50']:.1f} p95={moss_stats['p95']:.1f} avg={moss_stats['avg']:.1f} (mode fallback vs real)")
    save_results("moss_varied_total", ENV, {**total_stats, "base_url": BASE_URL, "type": "total_api_latency"})
    save_results("moss_varied_moss", ENV, {**moss_stats, "base_url": BASE_URL, "type": "moss_retrieval_latency", "note": "Moss retrieval latency separate from end-to-end"})

async def main():
    print(f"BASE_URL={BASE_URL} ENV={ENV}")
    print("=== Moss Benchmark (separate Moss retrieval vs total) ===")
    print("IMPORTANT: Moss retrieval latency != end-to-end application latency")
    await bench_moss_endpoint()
    await bench_moss_varied_queries()
    print("\nMoss benchmarks done. Results in tests/performance/results/")

if __name__ == "__main__":
    asyncio.run(main())
