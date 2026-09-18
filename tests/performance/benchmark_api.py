"""
benchmark_api.py — Basic API latency (health, etc.)
Measures current implementation, no artificial delays.
"""
import asyncio
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from benchmark_utils import run_concurrent_test, save_results, print_stats, DEFAULT_BASE_URL

BASE_URL = os.environ.get("BLUESENTINEL_BASE_URL", DEFAULT_BASE_URL)
ENV = os.environ.get("BENCH_ENV", "local")

async def bench_health():
    # Controlled concurrency appropriate for local/test env (pg max 10 connections)
    scenarios = [
        ("health_1c_20r", 1, 20),
        ("health_5c_30r", 5, 30),
        ("health_8c_40r", 8, 40),
    ]
    results = {}
    for name, conc, total in scenarios:
        stats = await run_concurrent_test(BASE_URL, "GET", "/api/health", conc, total)
        stats["path"] = "/api/health"
        stats["base_url"] = BASE_URL
        print_stats(name, stats)
        save_results(f"api_health_{conc}c", ENV, stats, {"scenario": name})
        results[name] = stats
        await asyncio.sleep(0.2)
    return results

async def bench_incidents_read():
    # Only read, safe without mutation, low concurrency to avoid pg saturation
    scenarios = [
        ("incidents_list_3c_15r", 3, 15, "GET", "/api/incidents"),
        ("incidents_list_5c_20r", 5, 20, "GET", "/api/incidents"),
    ]
    for name, conc, total, method, path in scenarios:
        stats = await run_concurrent_test(BASE_URL, method, path, conc, total)
        stats["path"] = path
        stats["base_url"] = BASE_URL
        print_stats(name, stats)
        save_results(f"api_incidents_list", ENV, stats, {"scenario": name})

async def main():
    print(f"BASE_URL={BASE_URL} ENV={ENV}")
    print("=== API Health Benchmark ===")
    # Cold vs warm: first request cold
    import time, httpx
    try:
        async with httpx.AsyncClient() as c:
            t0 = time.perf_counter()
            r = await c.get(BASE_URL + "/api/health")
            cold = (time.perf_counter()-t0)*1000
            print(f"Cold first request: {cold:.1f}ms status {r.status_code}")
            t0 = time.perf_counter()
            r = await c.get(BASE_URL + "/api/health")
            warm = (time.perf_counter()-t0)*1000
            print(f"Warm second request: {warm:.1f}ms status {r.status_code}")
            save_results("api_health_cold_warm", ENV, {"cold_ms": cold, "warm_ms": warm, "status": r.status_code, "base_url": BASE_URL})
    except Exception as e:
        print(f"Cold/warm check failed (server not running?): {e}")
        # Still attempt benchmarks; they will report failures
    await bench_health()
    await bench_incidents_read()
    print("\nAPI benchmarks done. Results in tests/performance/results/")

if __name__ == "__main__":
    asyncio.run(main())
