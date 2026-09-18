import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const mossLatency = new Trend('moss_latency', true);
const incidentLatency = new Trend('incident_api_latency', true);

export const options = {
  stages: [
    { duration: '15s', target: 5 },
    { duration: '30s', target: 12 },
    { duration: '30s', target: 20 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const MOSS_QUERIES = [
  "oil spill Arabian Sea SAR detection",
  "wind direction current temporal observation",
  "historical bilge discharge Mumbai",
];

export default function () {
  // Mix: health 30%, incidents 30%, moss 40%
  const r = Math.random();
  if (r < 0.3) {
    const res = http.get(`${BASE_URL}/api/health`);
    check(res, { 'health 200': (r) => r.status === 200 });
  } else if (r < 0.6) {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/incidents`);
    incidentLatency.add(Date.now() - start);
    check(res, { 'incidents 200': (r) => r.status === 200 });
  } else {
    const q = MOSS_QUERIES[Math.floor(Math.random()*MOSS_QUERIES.length)];
    const payload = JSON.stringify({ query: q, reason: "k6_combined" });
    const start = Date.now();
    const res = http.post(`${BASE_URL}/api/moss/search`, payload, { headers: { 'Content-Type': 'application/json' } });
    const total = Date.now() - start;
    check(res, { 'moss 200': (r) => r.status === 200 });
    try {
      const ml = res.json('metrics.latencyMs') || 0;
      mossLatency.add(ml);
    } catch {}
  }
  sleep(0.2);
}
