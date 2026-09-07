import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 }, // Ramp up to 20 virtual users over 10 seconds
    { duration: '30s', target: 20 }, // Hold at 20 virtual users for 30 seconds
    { duration: '10s', target: 0 },  // Ramp down to 0 virtual users
  ],
  thresholds: {
    // We expect 95% of requests to complete within 500ms
    http_req_duration: ['p(95)<500'],
    // At most 5% failure rate (handling possible edge cases or rate limiters if not bypassed)
    http_req_failed: ['rate<0.05'], 
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:80';

// Replace these with valid UUIDs of accounts existing in your database
// Or run a setup script beforehand to seed them.
const SOURCE_ACCOUNT_ID = __ENV.SOURCE_ACCOUNT_ID || '123e4567-e89b-12d3-a456-426614174000';
const DEST_ACCOUNT_ID = __ENV.DEST_ACCOUNT_ID || '123e4567-e89b-12d3-a456-426614174001';

export default function () {
  // Generate a unique idempotency key for every request
  const idempotencyKey = `load-test-${__VU}-${__ITER}-${Date.now()}`;
  
  const payload = JSON.stringify({
    source_account_id: SOURCE_ACCOUNT_ID,
    destination_account_id: DEST_ACCOUNT_ID,
    amount: 1, // 0.01 EUR per transfer to avoid depleting funds too fast
    currency: 'EUR',
  });

  // Randomize the IP to avoid triggering our Redis Rate Limiter too aggressively
  // Our rate limiter allows 10 reqs / min / IP.
  const randomIP = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-api-key',
      'Idempotency-Key': idempotencyKey,
      'X-Forwarded-For': randomIP,
    },
  };

  const res = http.post(`${BASE_URL}/transfers`, payload, params);

  // We check that the response is either 201 Created (Success) 
  // or 400 Bad Request (Insufficient Funds, which is a valid business logic response, not a system failure)
  // or 429 Too Many Requests (If rate limiter catches us)
  check(res, {
    'is status 201 or 400 or 429': (r) => [201, 400, 429].includes(r.status),
  });

  // Short pause to simulate real user behavior between clicks
  sleep(0.1);
}
