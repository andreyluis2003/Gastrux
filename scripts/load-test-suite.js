/**
 * FASE 39: Comprehensive Load Test Suite
 * Runs multiple load test scenarios against public pages
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const scenarios = [
  // Scenario 1: Homepage (light load)
  {
    name: 'Homepage',
    endpoint: '/',
    duration: 30,
    connections: 25,
    expectedRps: 50,
  },
  // Scenario 2: Auth page (login form)
  {
    name: 'Login Page',
    endpoint: '/auth/signin',
    duration: 30,
    connections: 20,
    expectedRps: 40,
  },
  // Scenario 3: Dashboard (heavier page)
  {
    name: 'Dashboard',
    endpoint: '/dashboard',
    duration: 30,
    connections: 15,
    expectedRps: 30,
  },
  // Scenario 4: Static assets
  {
    name: 'Static Assets',
    endpoint: '/manifest.json',
    duration: 30,
    connections: 30,
    expectedRps: 100,
  },
  // Scenario 5: API Health check
  {
    name: 'API Health',
    endpoint: '/api/health',
    duration: 30,
    connections: 20,
    expectedRps: 50,
  },
];

const resultsDir = path.join(__dirname, '..', '__tests__', 'load-test-results');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

async function runScenario(scenario) {
  console.log(`\n🔋 Running: ${scenario.name}`);
  console.log(`   Endpoint: ${scenario.endpoint}`);

  return new Promise((resolve, reject) => {
    const child = spawn('node', [
      path.join(__dirname, 'load-test.js'),
      scenario.endpoint,
      String(scenario.duration),
      String(scenario.connections),
    ], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ scenario, output });
      } else {
        reject(new Error(`${scenario.name} failed with code ${code}`));
      }
    });
  });
}

async function runSuite() {
  console.log('='.repeat(60));
  console.log('  FASE 39: COMPREHENSIVE LOAD TEST SUITE');
  console.log('='.repeat(60));
  console.log(`\n⏰ Starting at: ${new Date().toISOString()}`);
  console.log(`📊 Scenarios: ${scenarios.length}`);
  console.log(`⏳ Estimated Duration: ${scenarios.length * 35}s\n`);

  const results = [];

  for (const scenario of scenarios) {
    try {
      const result = await runScenario(scenario);
      results.push({ success: true, ...result });
    } catch (error) {
      console.error(`❌ ${scenario.name} failed:`, error.message);
      results.push({ success: false, scenario, error: error.message });
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }

  // Generate summary report
  console.log('\n' + '='.repeat(60));
  console.log('  LOAD TEST SUITE SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n✅ Passed: ${passed}/${scenarios.length}`);
  console.log(`❌ Failed: ${failed}/${scenarios.length}`);

  const summaryPath = path.join(resultsDir, `suite-summary-${Date.now()}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalScenarios: scenarios.length,
    passed,
    failed,
    scenarios: results.map(r => ({
      name: r.scenario.name,
      endpoint: r.scenario.endpoint,
      success: r.success,
      ...(r.error ? { error: r.error } : {}),
    })),
  }, null, 2));

  console.log(`\n📄 Summary saved to: ${summaryPath}`);
  console.log(`\n🎉 Load Test Suite Complete!\n`);
}

runSuite().catch(err => {
  console.error('Suite failed:', err);
  process.exit(1);
});
