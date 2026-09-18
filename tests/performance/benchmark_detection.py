"""
benchmark_detection.py — DEMO detection latency (no LIVE satellite dependency)
Separates detection API latency from LIVE provider latency.
"""
import asyncio
import os
import sys
import time
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from benchmark_utils import run_concurrent_test, save_results, print_stats, DEFAULT_BASE_URL

BASE_URL = os.environ.get("BLUESENTINEL_BASE_URL", DEFAULT_BASE_URL)
ENV = os.environ.get("BENCH_ENV", "local")

# Deterministic payload for detection? Detection uses /api/detect multipart, but we benchmark incidentes DEMO which triggers detection internally
# Alternative: benchmark POST /api/detect with synthetic image via multipart (if implemented) otherwise benchmark DEMO incident creation which includes detection

# For pure DEMO detection without external satellite, we benchmark POST /api/incidents with mode DEMO (includes detection + persistence, but not LIVE)
# We separate detection latency field from total

import httpx
import uuid

async def bench_demo_incident_creation():
    # Use unique ids to avoid idempotency, clean up after
    scenarios = [
        ("demo_create_1c_5r", 1, 5),
        ("demo_create_5c_10r", 5, 10),
    ]
    created_ids = []
    for name, conc, total in scenarios:
        # We will run sequentially with unique ids to avoid polluting
        latencies = []
        successes = 0
        failures = 0
        print(f"\n=== {name} (DEMO incident creation includes DEMO detection, no LIVE) ===")
        try:
            async with httpx.AsyncClient(timeout=40) as client:
                # Warm: first with timing
                t0 = time.perf_counter()
                test_id = f"perf-demo-{uuid.uuid4().hex[:8]}"
                r = await client.post(BASE_URL + "/api/incidents", json={"id": test_id, "region": "Arabian Sea", "location": {"lat": 19.2, "lon": 64.5, "label": "Arabian Sea"}, "mode": "DEMO", "sourceImageId": "DEMO-SAR-001"})
                warm = (time.perf_counter()-t0)*1000
                if 200 <= r.status_code < 400:
                    created_ids.append(test_id)
                    data = r.json()
                    det = data.get("detection", {})
                    print(f"  warm create {test_id[:12]} total={warm:.1f}ms detectionMs={det.get('processingLatencyMs')} status={r.status_code}")
                else:
                    print(f"  warm FAILED {r.status_code} {r.text[:200]}")
                await asyncio.sleep(0.3)
                # Concurrent creates
                sem = asyncio.Semaphore(conc)
                async def one():
                    async with sem:
                        tid = f"perf-demo-{uuid.uuid4().hex[:8]}"
                        t0 = time.perf_counter()
                        try:
                            resp = await client.post(BASE_URL + "/api/incidents", json={"id": tid, "region": "Arabian Sea", "location": {"lat": 19.2, "lon": 64.5, "label": "Arabian Sea"}, "mode": "DEMO", "sourceImageId": "DEMO-SAR-001"})
                            lat = (time.perf_counter()-t0)*1000
                            ok = 200 <= resp.status_code < 400
                            if ok:
                                created_ids.append(tid)
                            return {"ok": ok, "lat": lat, "status": resp.status_code, "resp": resp}
                        except Exception as e:
                            lat = (time.perf_counter()-t0)*1000
                            return {"ok": False, "lat": lat, "status": 0, "error": str(e)}
                start = time.perf_counter()
                tasks = [one() for _ in range(total)]
                results = await asyncio.gather(*tasks)
                wall = time.perf_counter()-start
                lats = [res["lat"] for res in results]
                succ = sum(1 for r in results if r["ok"])
                fail = total - succ
                from benchmark_utils import compute_stats
                stats = compute_stats(lats)
                stats.update({"concurrency": conc, "total_requests": total, "successes": succ, "failures": fail, "wall_time_s": wall, "throughput_rps": total/wall if wall>0 else 0, "warm_ms": warm})
                print_stats(name, stats)
                # Extract detection latencies where available
                det_lats = []
                for res in results:
                    if res.get("resp") is not None and res["ok"]:
                        try:
                            j = res["resp"].json()
                            dl = j.get("detection", {}).get("processingLatencyMs")
                            if dl is not None:
                                det_lats.append(float(dl))
                        except: pass
                if det_lats:
                    from benchmark_utils import compute_stats as cs2
                    dstats = cs2(det_lats)
                    print(f"  Detection processingLatencyMs: p50={dstats['p50']:.1f} p95={dstats['p95']:.1f} avg={dstats['avg']:.1f}")
                    save_results(f"demo_detection_latency_{conc}c", ENV, {**dstats, "type": "detection_processingLatencyMs", "base_url": BASE_URL})
                save_results(f"demo_incident_{conc}c", ENV, {**stats, "base_url": BASE_URL, "path": "/api/incidents (DEMO)", "note": "Includes DEMO detection + persistence, no LIVE external call"})
        except Exception as e:
            print(f"Demo incident bench failed (server not running?): {e}")
            save_results("demo_incident_error", ENV, {"error": str(e)[:300], "base_url": BASE_URL})
    # Cleanup created test incidents
    if created_ids:
        print(f"\nCleaning up {len(created_ids)} test incidents...")
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                for tid in created_ids[:20]:  # limit cleanup
                    try:
                        await client.delete(BASE_URL + f"/api/incidents/{tid}")
                    except: pass
            print("Cleanup done")
        except Exception as e:
            print(f"Cleanup failed: {e}")

async def main():
    print(f"BASE_URL={BASE_URL} ENV={ENV}")
    print("=== Detection Benchmark (DEMO separate from LIVE) ===")
    print("DEMO detection measured without external satellite dependency")
    print("LIVE Sentinel-1 acquisition NOT merged with local detection; report separately")
    await bench_demo_incident_creation()
    print("\nDetection benchmarks done.")

if __name__ == "__main__":
    asyncio.run(main())
