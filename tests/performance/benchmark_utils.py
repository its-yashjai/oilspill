"""
benchmark_utils.py — shared helpers for asyncio performance benchmarks.
Measures current implementation without artificial delays.
"""
import asyncio
import json
import csv
import os
import time
import statistics
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

# Try httpx first, fallback to aiohttp
try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False
    import aiohttp

DEFAULT_BASE_URL = os.environ.get("BLUESENTINEL_BASE_URL", "http://localhost:3000")
RESULTS_DIR = Path(__file__).parent / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

def percentile(data: List[float], p: float) -> float:
    if not data:
        return 0.0
    sorted_data = sorted(data)
    k = (len(sorted_data) - 1) * (p / 100)
    f = int(k)
    c = min(f + 1, len(sorted_data) - 1)
    if f == c:
        return sorted_data[int(k)]
    d0 = sorted_data[f] * (c - k)
    d1 = sorted_data[c] * (k - f)
    return d0 + d1

def compute_stats(latencies: List[float]) -> Dict[str, float]:
    if not latencies:
        return {"count": 0, "p50": 0, "p95": 0, "p99": 0, "min": 0, "max": 0, "avg": 0, "throughput": 0}
    return {
        "count": len(latencies),
        "p50": percentile(latencies, 50),
        "p95": percentile(latencies, 95),
        "p99": percentile(latencies, 99),
        "min": min(latencies),
        "max": max(latencies),
        "avg": statistics.mean(latencies),
        "stdev": statistics.pstdev(latencies) if len(latencies) > 1 else 0,
    }

async def fetch_one(client, method: str, url: str, **kwargs) -> Dict[str, Any]:
    start = time.perf_counter()
    try:
        if HAS_HTTPX:
            resp = await client.request(method, url, **kwargs)
            latency = (time.perf_counter() - start) * 1000
            # need to read body to finish timing? httpx already does
            ok = 200 <= resp.status_code < 400
            body_text = resp.text[:500] if hasattr(resp, 'text') else ""
            return {"ok": ok, "status": resp.status_code, "latency": latency, "error": None if ok else f"HTTP {resp.status_code}", "body": body_text}
        else:
            async with client.request(method, url, **kwargs) as resp:
                await resp.text()
                latency = (time.perf_counter() - start) * 1000
                ok = 200 <= resp.status < 400
                return {"ok": ok, "status": resp.status, "latency": latency, "error": None if ok else f"HTTP {resp.status}", "body": ""}
    except Exception as e:
        latency = (time.perf_counter() - start) * 1000
        return {"ok": False, "status": 0, "latency": latency, "error": str(e)[:300], "body": ""}

async def run_concurrent_test(
    base_url: str,
    method: str,
    path: str,
    concurrency: int,
    total_requests: int,
    json_body: Optional[Dict] = None,
    headers: Optional[Dict] = None,
    timeout: float = 30.0,
) -> Dict[str, Any]:
    """Run total_requests with concurrency limit, return aggregated stats."""
    sem = asyncio.Semaphore(concurrency)
    latencies: List[float] = []
    successes = 0
    failures = 0
    errors: List[str] = []
    status_counts: Dict[int, int] = {}

    url = base_url.rstrip("/") + path

    async def bounded_fetch(client):
        async with sem:
            kwargs = {"timeout": timeout}
            if json_body is not None:
                kwargs["json"] = json_body
            if headers:
                kwargs["headers"] = headers
            result = await fetch_one(client, method, url, **kwargs)
            latencies.append(result["latency"])
            if result["ok"]:
                successes.__class__ # placeholder
                return result
            return result

    start_all = time.perf_counter()
    if HAS_HTTPX:
        async with httpx.AsyncClient(timeout=timeout) as client:
            tasks = [bounded_fetch(client) for _ in range(total_requests)]
            results = await asyncio.gather(*tasks)
    else:
        async with aiohttp.ClientSession() as client:
            tasks = [bounded_fetch(client) for _ in range(total_requests)]
            results = await asyncio.gather(*tasks)

    wall_time = time.perf_counter() - start_all
    throughput = total_requests / wall_time if wall_time > 0 else 0

    for r in results:
        status_counts[r["status"]] = status_counts.get(r["status"], 0) + 1
        if r["ok"]:
            successes += 1
        else:
            failures += 1
            if r["error"]:
                errors.append(r["error"][:100])

    stats = compute_stats(latencies)
    stats.update({
        "concurrency": concurrency,
        "total_requests": total_requests,
        "successes": successes,
        "failures": failures,
        "wall_time_s": wall_time,
        "throughput_rps": throughput,
        "status_counts": status_counts,
        "sample_errors": errors[:5],
    })
    return stats

def save_results(test_name: str, env: str, data: Dict[str, Any], extra: Optional[Dict]=None):
    ts = datetime.now(timezone.utc).isoformat()
    payload = {
        "timestamp": ts,
        "environment": env,
        "test_name": test_name,
        "base_url": data.get("base_url", DEFAULT_BASE_URL),
        "node_version": os.environ.get("NODE_VERSION", ""),
        "git_commit": os.environ.get("GIT_COMMIT", "") or os.popen("git rev-parse --short HEAD 2>&1").read().strip()[:12],
        **data,
    }
    if extra:
        payload.update(extra)
    # JSON
    out_json = RESULTS_DIR / f"{test_name}.json"
    # Append or create array? We'll store latest plus history array
    history = []
    if out_json.exists():
        try:
            existing = json.loads(out_json.read_text())
            if isinstance(existing, list):
                history = existing
            else:
                history = [existing]
        except:
            history = []
    history.append(payload)
    out_json.write_text(json.dumps(history, indent=2))
    # CSV (latest)
    out_csv = RESULTS_DIR / f"{test_name}.csv"
    # Flatten for CSV
    flat = {k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in payload.items()}
    # Write header if not exists
    is_new = not out_csv.exists()
    with open(out_csv, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(flat.keys()))
        if is_new:
            writer.writeheader()
        writer.writerow(flat)
    return payload

def print_stats(name: str, stats: Dict[str, Any]):
    print(f"\n=== {name} ===")
    print(f"  concurrency={stats.get('concurrency')} total={stats.get('total_requests')} successes={stats.get('successes')} failures={stats.get('failures')}")
    print(f"  p50={stats.get('p50',0):.1f}ms p95={stats.get('p95',0):.1f}ms p99={stats.get('p99',0):.1f}ms avg={stats.get('avg',0):.1f}ms min={stats.get('min',0):.1f}ms max={stats.get('max',0):.1f}ms")
    print(f"  throughput={stats.get('throughput_rps',0):.1f} rps wall={stats.get('wall_time_s',0):.2f}s status={stats.get('status_counts')}")

# Deterministic test queries
DETERMINISTIC_MOSS_QUERIES = [
    "oil spill Arabian Sea SAR detection",
    "wind direction current temporal observation",
    "historical bilge discharge Mumbai",
    "chlorophyll algal bloom look-alike",
    "Sentinel-1 GRD damping dark spot",
]

DETERMINISTIC_DEMO_PAYLOADS = [
    {"region": "Arabian Sea", "location": {"lat": 19.2, "lon": 64.5, "label": "Arabian Sea · Off Mumbai"}, "mode": "DEMO"},
    {"region": "Bay of Bengal", "location": {"lat": 16.5, "lon": 88.0, "label": "Bay of Bengal"}, "mode": "DEMO"},
]

