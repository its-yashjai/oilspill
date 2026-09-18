import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

export const options = {
  stages: [
    { duration: '10s', target: 5 },   // warm-up
    { duration: '20s', target: 10 },  // moderate load
    { duration: '20s', target: 20 },  // higher controlled load
    { duration: '10s', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, {
    'health 200': (r) => r.status === 200,
    'health has status ok': (r) => {
      try { return r.json('status') === 'ok'; } catch { return false; }
    },
  });
  sleep(0.2);
}
