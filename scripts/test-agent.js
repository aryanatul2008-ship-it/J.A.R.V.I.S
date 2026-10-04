/**
 * test-agent.js - Verification test script for JARVIS Assistant Brain & Agent Loop
 * Runs 3 sample commands against the agent with a test user and prints all emitted events.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const db = require('../server/db');
const geminiService = require('../server/services/gemini');

async function runTests() {
  console.log('====================================================');
  console.log('   J.A.R.V.I.S AGENT REASONING CORE TEST SUITE      ');
  console.log('====================================================\n');

  await db.init();

  let testUserId = null;

  try {
    // 1. Seed temporary test user
    const userRes = await db.query(
      `INSERT INTO users (google_id, email, name, invite_code, timezone)
       VALUES ('test_tony_fake_id', 'tony@stark.test', 'Tony Stark', 'tony_agent_test', 'America/New_York')
       ON CONFLICT (google_id)
       DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    testUserId = userRes.rows[0].id;

    // 2. Seed a test contact for Bruce Banner
    await db.query(
      `INSERT INTO contacts (user_id, name, aliases, chat_id)
       VALUES ($1, 'Bruce Banner', ARRAY['Hulk', 'Bruce'], 123456789)
       ON CONFLICT (user_id, chat_id)
       DO UPDATE SET aliases = EXCLUDED.aliases`,
      [testUserId]
    );

    const testCases = [
      {
        title: 'TEST 1: Calendar Scheduling',
        text: 'Schedule a meeting with Bruce Banner tomorrow at 4 PM to review Mark 50 telemetry',
        history: []
      },
      {
        title: 'TEST 2: Personal Reminder',
        text: 'Remind me to check the arc reactor output at 8 PM tomorrow',
        history: []
      },
      {
        title: 'TEST 3: Telegram Message Preparation (Consequential Action)',
        text: 'Send a Telegram message to Bruce saying the arc reactor is at 100% capacity and ready',
        history: []
      }
    ];

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      console.log(`\n----------------------------------------------------`);
      console.log(`[${i + 1}/3] ${tc.title}`);
      console.log(`PROMPT: "${tc.text}"`);
      console.log(`----------------------------------------------------`);

      const emittedEvents = [];

      const emit = (event) => {
        emittedEvents.push(event);
        if (event.type === 'step') {
          const detail = event.status === 'done'
            ? `-> Result: ${JSON.stringify(event.result)}`
            : (event.status === 'error' ? `-> Error: [${event.code}] ${event.message}` : `(Executing...)`);
          console.log(`  [STEP] ${event.tool} [${event.status.toUpperCase()}]: ${event.summary} ${detail}`);
        } else if (event.type === 'message') {
          console.log(`  [JARVIS]: ${event.text}`);
        } else if (event.type === 'error') {
          console.log(`  [ERROR]: [${event.code}] ${event.message}`);
        }
      };

      const nowISO = new Date('2026-10-04T12:00:00-04:00').toISOString();

      await geminiService.runAgent({
        userId: testUserId,
        text: tc.text,
        history: tc.history,
        timezone: 'America/New_York',
        nowISO,
        emit
      });

      console.log(`\nEvents Emitted: ${emittedEvents.length} event(s)`);
    }

    // Inspect pending actions table for Test 3
    const pendingRes = await db.query(
      'SELECT id, tool, summary, status FROM pending_actions WHERE user_id = $1',
      [testUserId]
    );
    console.log(`\nPending actions created: ${pendingRes.rows.length}`);
    pendingRes.rows.forEach(pa => {
      console.log(` - Action ${pa.id}: [${pa.status}] ${pa.summary}`);
    });

    console.log('\n====================================================');
    console.log('   ALL 3 AGENT TESTS EXECUTED SUCCESSFULLY          ');
    console.log('====================================================');
  } catch (err) {
    console.error('\n[FATAL] Test execution failed:', err);
  } finally {
    // Clean up temporary user and all cascading data
    if (testUserId) {
      await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
      console.log('\n[CLEANUP] Temporary test user and cascaded data purged.');
    }
    await db.pool.end();
  }
}

runTests();
