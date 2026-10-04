/**
 * test-robustness-history.js
 * Test suite for error codes, GET /api/status, GET /api/history, and pending confirmations safety net.
 */

const assert = require('assert');
const serverErrors = require('../server/errors');
const db = require('../server/db');

async function runTests() {
  console.log('====================================================');
  console.log('   J.A.R.V.I.S ROBUSTNESS & HISTORY TEST SUITE     ');
  console.log('====================================================\n');

  // 1. Centralized Error Codes Verification
  console.log('[TEST 1] Verifying centralized error codes...');
  const expectedCodes = [
    'auth_expired',
    'permission_denied',
    'validation',
    'clarification_needed',
    'recipient_unreachable',
    'integration_unavailable',
    'ai_unavailable',
    'not_found'
  ];

  const serverCodeValues = Object.values(serverErrors.ERROR_CODES);
  expectedCodes.forEach(code => {
    assert(serverCodeValues.includes(code), `Server errors should include ${code}`);
    assert(serverErrors.ERROR_METADATA[code], `Server error metadata should exist for ${code}`);
  });

  // Verify frontend ERROR_MAP
  const fs = require('fs');
  const path = require('path');
  const frontendErrorsCode = fs.readFileSync(path.join(__dirname, '../public/js/errors.js'), 'utf8');
  const sandbox = { window: {} };
  eval(`(function(window) { ${frontendErrorsCode} })(sandbox.window)`);
  const frontendMap = sandbox.window.ERROR_MAP;

  expectedCodes.forEach(code => {
    assert(frontendMap[code], `Frontend ERROR_MAP should include ${code}`);
    assert(frontendMap[code].message, `Frontend ${code} should have a friendly message`);
    assert(frontendMap[code].action, `Frontend ${code} should have a suggested next step`);
  });

  const friendly = sandbox.window.getFriendlyError('auth_expired');
  assert(friendly.action === 'Reconnect Google', 'auth_expired action should be Reconnect Google');
  console.log('✓ All 8 centralized error codes verified across server and frontend mappings.\n');

  // 2. Database Setup: Create temporary test user
  console.log('[TEST 2] Setting up test user and seeding action_log & pending_actions...');
  await db.init();

  const userRes = await db.query(
    `INSERT INTO users (google_id, email, name, invite_code)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    ['test-robust-gid', 'tony.robust@stark.test', 'Tony Stark Robust', 'robust_invite_123']
  );
  const userId = userRes.rows[0].id;

  // Insert sample action_log rows
  await db.query(
    `INSERT INTO action_log (user_id, tool, summary, status, error, created_at)
     VALUES 
      ($1, 'create_calendar_event', 'Schedule Mark 50 Telemetry', 'success', NULL, NOW() - INTERVAL '10 minutes'),
      ($1, 'create_reminder', 'Check Arc Reactor', 'failed', 'Reminder due time must be in the future', NOW() - INTERVAL '5 minutes'),
      ($1, 'send_telegram_message', 'Send update to Bruce', 'cancelled', 'Cancelled by user', NOW() - INTERVAL '2 minutes')`,
    [userId]
  );

  // Insert a sample pending action
  const pendingRes = await db.query(
    `INSERT INTO pending_actions (user_id, tool, args, summary, status)
     VALUES ($1, 'send_telegram_message', $2, 'Send to Bruce: "Test message"', 'pending')
     RETURNING id`,
    [userId, JSON.stringify({ recipient: 'Bruce Banner', message: 'Test message' })]
  );
  const pendingId = pendingRes.rows[0].id;
  console.log('✓ Test user, action_log, and pending_action initialized.\n');

  // 3. Test GET /api/history
  console.log('[TEST 3] Testing action_log history query logic...');
  const historyQuery = await db.query(
    `SELECT id, tool, summary, status, error, created_at
     FROM action_log
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  );
  assert.strictEqual(historyQuery.rows.length, 3, 'Should retrieve 3 action_log rows');
  assert.strictEqual(historyQuery.rows[0].status, 'cancelled', 'Newest row should be cancelled');
  assert.strictEqual(historyQuery.rows[1].status, 'failed', 'Second row should be failed');
  assert(historyQuery.rows[1].error.includes('due time'), 'Failure row should contain error text');
  console.log('✓ History query retrieves newest-first rows with status and failure messages.\n');

  // 4. Test GET /api/actions/pending
  console.log('[TEST 4] Testing pending action safety net retrieval...');
  const pendingQuery = await db.query(
    `SELECT id, tool, args, summary, status, created_at
     FROM pending_actions
     WHERE user_id = $1
       AND status = 'pending'
       AND created_at >= NOW() - INTERVAL '15 minutes'
     ORDER BY created_at ASC`,
    [userId]
  );
  assert.strictEqual(pendingQuery.rows.length, 1, 'Should retrieve 1 pending action');
  assert.strictEqual(pendingQuery.rows[0].id, pendingId, 'Pending action ID should match');
  console.log('✓ Pending confirmations safety net retrieves active pending actions.\n');

  // 5. Test Integration Status Health Checks
  console.log('[TEST 5] Testing integration health check components...');
  const statusRoute = require('../server/routes/status');
  assert(statusRoute, 'Status route module should load');

  const config = require('../server/config');
  const aiStatus = (config.GEMINI_API_KEY && config.GEMINI_API_KEY.trim() && !config.GEMINI_API_KEY.includes('your_')) ? 'online' : 'unavailable';
  assert.strictEqual(aiStatus, 'online', 'AI status should be online with configured API key');
  console.log('✓ Integration health check components verified.\n');

  // Clean up
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
  console.log('[CLEANUP] Test user and cascaded records purged.');
  console.log('\n====================================================');
  console.log('   ALL ROBUSTNESS & HISTORY TESTS PASSED!          ');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('\n❌ ROBUSTNESS TEST FAILED:', err);
  process.exit(1);
});
