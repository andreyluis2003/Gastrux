/**
 * FASE 39: Load Testing Script
 * Uses autocannon for HTTP benchmarking against public endpoints
 * 
 * Usage:
 *   node scripts/load-test.js [endpoint] [duration] [connections]
 * 
 * Examples:
 *   node scripts/load-test.js /api/health 30 10
 *   node scripts/load-test.js / 30 50
 */

const autocannon = require('autocannon');
const fs = require('fs');
const path = require('path');

// Get command line arguments
const endpoint = process.argv[2] || '/';
const duration = parseInt(process.argv[3]) || 30; // seconds
const connections = parseInt(process.argv[4]) || 10;
const pipelining = parseInt(process.argv[5]) || 1;

// Read environment for base URL
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Use preview URL or production URL
const baseUrl = process.env.LOAD_TEST_URL || 'http://localhost:3000';
const fullUrl = `${baseUrl}${endpoint}`;

console.log(`\n🚀 FASE 39: Load Test Starting`);
console.log(`   URL: ${fullUrl}`);
console.log(`   Duration: ${duration}s`);
console.log(`   Connections: ${connections}`);
console.log(`   Pipelining: ${pipelining}`);
console.log(`   Expected Requests: ~${connections * (1000 / 50) * duration} (estimated)\n`);

const run = async () => {
  const result = await autocannon({
    url: fullUrl,
    connections,
    duration,
    pipelining,
    headers: {
      'Accept': 'text/html,application/json',
    },
    forever: false,
    bailout: 5000,
  });

  // Print results
  console.log('\n✅ Load Test Complete\n');
  console.log('=== Results ===');
  console.log(`Requests/sec:     ${result.requests.average.toFixed(2)}`);
  console.log(`Latency (avg):    ${result.latency.average.toFixed(2)} ms`);
  console.log(`Latency (p50):    ${result.latency.p50.toFixed(2)} ms`);
  console.log(`Latency (p99):    ${result.latency.p99.toFixed(2)} ms`);
  console.log(`Latency (max):    ${result.latency.max.toFixed(2)} ms`);
  console.log(`Throughput:       ${(result.throughput.average / 1024).toFixed(2)} KB/sec`);
  console.log(`Errors:           ${result.errors}`);
  console.log(`Timeouts:         ${result.timeouts}`);
  console.log(`Total Requests:   ${result.requests.sent}`);
  console.log(`2xx Responses:    ${result['2xx']}`);
  console.log(`3xx Responses:    ${result['3xx'] || 0}`);
  console.log(`4xx Responses:    ${result['4xx']}`);
  console.log(`5xx Responses:    ${result['5xx']}`);

  // Performance assessment
  console.log('\n=== Performance Assessment ===');
  const rps = result.requests.average;
  const avgLatency = result.latency.average;
  const totalRequests = result.requests.sent || 1;
  const errorRate = result.errors / totalRequests;

  if (rps > 100 && avgLatency < 200 && errorRate < 0.01) {
    console.log('🔵 EXCELLENT - Production ready performance');
  } else if (rps > 50 && avgLatency < 500 && errorRate < 0.05) {
    console.log('🟢 GOOD - Acceptable for production');
  } else if (rps > 20 && avgLatency < 1000 && errorRate < 0.1) {
    console.log('🟡 ACCEPTABLE - Consider optimization');
  } else {
    console.log('🔴 NEEDS OPTIMIZATION - Performance issues detected');
  }

  // Save results
  const resultsDir = path.join(__dirname, '..', '__tests__', 'load-test-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `load-test-${endpoint.replace(/[\/]/g, '-')}-${timestamp}.json`;
  const filepath = path.join(resultsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify({
    endpoint,
    url: fullUrl,
    duration,
    connections,
    pipelining,
    timestamp: new Date().toISOString(),
    results: {
      requestsPerSecond: result.requests.average,
      latency: {
        average: result.latency.average,
        p50: result.latency.p50,
        p99: result.latency.p99,
        max: result.latency.max,
      },
      throughput: result.throughput.average,
      errors: result.errors,
      timeouts: result.timeouts,
      totalRequests: result.requests.sent,
      statusCodes: {
        '2xx': result['2xx'],
        '3xx': result['3xx'] || 0,
        '4xx': result['4xx'],
        '5xx': result['5xx'],
      },
    },
    assessment: {
      rating: errorRate < 0.01 && avgLatency < 200 ? 'EXCELLENT' :
              errorRate < 0.05 && avgLatency < 500 ? 'GOOD' :
              errorRate < 0.1 && avgLatency < 1000 ? 'ACCEPTABLE' : 'NEEDS_OPTIMIZATION',
    },
  }, null, 2));

  console.log(`\n📄 Results saved to: ${filepath}\n`);
};

run().catch(err => {
  console.error('❌ Load test failed:', err.message);
  process.exit(1);
});
