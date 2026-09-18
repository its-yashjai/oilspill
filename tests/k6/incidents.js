import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const incidentLatency = new Trend('incident_api_latency', true);

export const options = {
  stages: [
    { duration: '10s', target: 3 },
    { duration: '20s', target: 7 },
    { duration: '20s', target: 12 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1200'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Read: list
  let start = Date.now();
  let res = http.get(`${BASE_URL}/api/incidents`);
  incidentLatency.add(Date.now() - start);
  check(res, { 'incidents list 200': (r) => r.status === 200 });

  // Try to fetch a known incident if exists; otherwise skip
  try {
    const list = res.json('incidents') || res.json().incidents || [];
    if (Array.isArray(list) && list.length > 0) {
      const pick = list[__VU % list.length];
      const id = pick.id;
      start = Date.now();
      const r2 = http.get(`${BASE_URL}/api/incidents/${id}`);
      incidentLatency.add(Date.now() - start);
      check(r2, {
        'incident get 200': (r) => r.status === 200,
        'incident has findings': (r) => {
          try { return r.json().findings !== undefined; } catch { return false; }
        },
      });
    }
  } catch {}

  sleep(0.5);
}
