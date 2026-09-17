'use strict';

const http = require('node:http');

const request = http.request(
  {
    host: '127.0.0.1',
    port: Number(process.env.PORT || 3000),
    path: '/api/health/platform-dr',
    method: 'GET',
    headers: { connection: 'close' },
    timeout: 4000,
  },
  (response) => {
    response.resume();
    const status = Number(response.statusCode || 0);
    if (status >= 200 && status < 300) {
      process.exit(0);
    }
    console.error(`Health check returned HTTP ${status}.`);
    process.exit(1);
  },
);

request.on('timeout', () => {
  console.error('Health check timed out.');
  request.destroy();
});

request.on('error', (error) => {
  console.error(`Health check request failed: ${error.code || error.message}`);
  process.exit(1);
});

request.end();
