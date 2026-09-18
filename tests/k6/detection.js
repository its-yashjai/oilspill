import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const detectionLatency = new Trend('detection_latency', true);

export const options = {
  stages: [
    { duration: '10s', target: 2 },
    { duration: '20s', target: 5 },
    { duration: '20s', target: 8 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.1'],
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // DEMO incident creation includes DEMO detection (no external LIVE dependency)
  const id = `k6-detect-${__VU}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  const payload = JSON.stringify({
    id: id,
    region: "Arabian Sea",
    location: { lat: 19.2, lon: 64.5, label: "Arabian Sea k6" },
    mode: "DEMO",
    sourceImageId: "DEMO-SAR-001",
  });
  const params = { headers: { 'Content-Type': 'application/json' } };
  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/incidents`, payload, params);
  detectionLatency.add(Date.now() - start);
  const ok = check(res, {
    'demo create 200/202': (r) => r.status === 200 || r.status === 202,
    'demo has detection': (r) => {
      try { return r.json('detection') !== undefined || r.json().detection !== undefined; } catch { return false; }
    },
  });
  // Cleanup: delete created test incident (fire-and-forget)
  if (res.status === 202 || res.status === 200) {
    try { http.del(`${BASE_URL}/api/incidents/${id}`); } catch {}
  }
  sleep(0.5);
}
