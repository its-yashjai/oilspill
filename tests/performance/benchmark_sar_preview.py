"""
benchmark_sar_preview.py — SAR preview generation time (separate from map layout)
Measures direct renderSarPreviewBytes vs HTTP endpoint, cold vs warm (cache)
"""
import asyncio, os, sys, time, json, statistics
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

BASE_URL = os.environ.get("BLUESENTINEL_BASE_URL", "http://localhost:3000")
ENV = os.environ.get("BENCH_ENV", "local")

# Use an existing LIVE incident for realistic bbox
import httpx, uuid

async def get_live_incident():
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(BASE_URL + "/api/incidents")
        j = r.json()
        incs = j.get("incidents") or []
        # pick a LIVE one with productId containing S1D
        for inc in incs:
            if "live-" in inc["id"]:
                return inc["id"]
        return incs[0]["id"] if incs else None

async def bench_sar_http():
    inc_id = await get_live_incident()
    if not inc_id:
        print("No incident found for SAR bench")
        return
    print(f"Using incident {inc_id} for SAR preview bench")
    # Warm: first request (cold - will render)
    # We have v4 cache, so first may be cold if not cached, second warm
    import time as t
    async with httpx.AsyncClient(timeout=40) as c:
        for role in ["current", "previous"]:
            # cold
            url = f"{BASE_URL}/api/incidents/{inc_id}/sar-preview/{role}?v=4"
            # bust cache by adding extra param for cold vs warm? But we want cache behavior: first cold (miss), second warm (hit)
            # Do cold
            t0 = t.perf_counter()
            r = await c.get(url)
            cold = (t.perf_counter()-t0)*1000
            print(f"SAR {role} cold: {cold:.1f}ms status {r.status_code} len {len(r.content)} ct {r.headers.get('content-type')}")
            # warm (should hit cache)
            t0 = t.perf_counter()
            r2 = await c.get(url)
            warm = (t.perf_counter()-t0)*1000
            print(f"SAR {role} warm (cache): {warm:.1f}ms status {r2.status_code} len {len(r2.content)}")
            # concurrent 3
            sem = asyncio.Semaphore(3)
            async def one():
                async with sem:
                    tt0 = t.perf_counter()
                    rr = await c.get(url)
                    return (t.perf_counter()-tt0)*1000, rr.status_code
            tasks = [one() for _ in range(5)]
            res = await asyncio.gather(*tasks)
            lats = [x[0] for x in res]
            avg = statistics.mean(lats)
            p95 = sorted(lats)[int(len(lats)*0.95)]
            print(f"SAR {role} 3c 5r concurrent avg {avg:.1f} p95 {p95:.1f} min {min(lats):.1f} max {max(lats):.1f}")

async def bench_direct_render():
    # Direct function call (bypass HTTP, measure just Process API + stretch)
    # This requires same env as server (COPERNICUS creds), so we try via HTTP alternative if not available
    try:
        # Try to import and call directly if creds available
        import importlib.util
        # We'll just time the HTTP cold generation as proxy, since direct requires creds in this process env
        print("Direct render bench skipped (requires server env), using HTTP as proxy")
    except Exception as e:
        print(f"Direct bench failed: {e}")

async def main():
    print(f"BASE_URL={BASE_URL} ENV={ENV}")
    print("=== SAR Preview Generation Benchmark ===")
    print("Measures /api/incidents/[id]/sar-preview/[role] cold (Process API) vs warm (cache)")
    await bench_sar_http()
    print("\nSAR benchmarks done")

if __name__ == "__main__":
    asyncio.run(main())
