import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const mossLatency = new Trend('moss_latency', true);
const totalLatency = new Trend('total_api_latency', true);

export const options = {
  stages: [
    { duration: '10s', target: 3 },
    { duration: '20s', target: 8 },
    { duration: '20s', target: 15 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const QUERIES = [
  "oil spill Arabian Sea SAR detection",
  "wind direction current temporal observation",
  "historical bilge discharge Mumbai",
  "chlorophyll algal bloom look-alike",
  "Sentinel-1 GRD damping dark spot",
];

export default function () {
  const q = QUERIES[__VU % QUERIES.length];
  const payload = JSON.stringify({ query: q, reason: "k6_moss", limit: 5 });
  const params = { headers: { 'Content-Type': 'application/json' } };
  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/moss/search`, payload, params);
  const total = Date.now() - start;
  totalLatency.add(total);
  check(res, {
    'moss 200': (r) => r.status === 200,
    'moss has results': (r) => {
      try { return Array.isArray(r.json('results')); } catch { return false; }
    },
  });
  try {
    const j = res.json();
    const ml = j.metrics ? (j.metrics.latencyMs || 0) : 0;
    mossLatency.add(ml);
  } catch {}
  sleep(0.3);
}
