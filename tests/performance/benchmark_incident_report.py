"""
benchmark_incident_report.py — incident/detection/report endpoint performance
"""
import asyncio, os, sys, time, json, statistics
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from benchmark_utils import run_concurrent_test, save_results, print_stats, DEFAULT_BASE_URL

BASE_URL = os.environ.get("BLUESENTINEL_BASE_URL", "http://localhost:3000")
ENV = os.environ.get("BENCH_ENV", "local")
import httpx

async def get_any_incident():
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(BASE_URL+"/api/incidents")
        j = r.json()
        incs = j.get("incidents") or []
        if incs:
            return incs[0]["id"]
        return None

async def bench_incident_get():
    inc_id = await get_any_incident()
    if not inc_id:
        print("no incident for get bench")
        return
    for name, conc, total in [("incident_get_1c_10r",1,10), ("incident_get_3c_15r",3,15), ("incident_get_5c_20r",5,20)]:
        stats = await run_concurrent_test(BASE_URL, "GET", f"/api/incidents/{inc_id}", conc, total)
        stats["path"]=f"/api/incidents/{inc_id}"
        print_stats(name, stats)
        save_results(f"incident_get_{conc}c", ENV, stats, {"scenario":name})

async def bench_report():
    inc_id = await get_any_incident()
    if not inc_id:
        print("no incident for report bench")
        return
    # Report may be GET /api/incidents/[id]/report
    for name, conc, total in [("report_1c_10r",1,10), ("report_3c_15r",3,15)]:
        stats = await run_concurrent_test(BASE_URL, "GET", f"/api/incidents/{inc_id}/report", conc, total)
        stats["path"]=f"/api/incidents/[id]/report"
        print_stats(name, stats)
        save_results(f"report_{conc}c", ENV, stats, {"scenario":name})

async def bench_detection_endpoint():
    # /api/detect if exists, otherwise use incident creation as proxy
    # Try to list detection runs via /api/incidents/[id] includes detection
    # We'll just measure GET /api/incidents/[id] which includes detection field
    await bench_incident_get()

async def main():
    print(f"BASE_URL={BASE_URL} ENV={ENV}")
    print("=== Incident / Report Benchmark ===")
    await bench_incident_get()
    await bench_report()
    print("done")

if __name__ == "__main__":
    asyncio.run(main())
