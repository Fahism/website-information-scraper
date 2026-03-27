#!/usr/bin/env ts-node
/**
 * Verifies SearchAPI key rotation logic.
 *
 * Run:
 *   npx ts-node --project tsconfig.tsnode.json scripts/test-key-rotation.ts
 *
 * Tests:
 *   1. Unit tests — key manager logic (no HTTP)
 *   2. Rotation simulation — axios patched to return 429 for Key 1, success for Key 2
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.log(`  ✗  ${label}${detail ? `  →  ${detail}` : ''}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n── ${title} ${'─'.repeat(50 - title.length)}`);
}

// ─── 1. Unit tests: key manager ──────────────────────────────────────────────

section('Unit Tests: Key Manager');

// Set env vars BEFORE requiring the module (module init reads these)
process.env.SEARCHAPI_API_KEY_1 = 'unit_test_key_1';
process.env.SEARCHAPI_API_KEY_2 = 'unit_test_key_2';

// Use require() so module loads AFTER env vars are set above
// eslint-disable-next-line @typescript-eslint/no-require-imports
const km = require('../src/lib/searchapi-key-manager') as typeof import('../src/lib/searchapi-key-manager');

assert(
  'getNextAvailableKey() returns Key 1 when both keys are fresh',
  km.getNextAvailableKey() === 'unit_test_key_1'
);

km.markKeyExhausted('unit_test_key_1');

assert(
  'getNextAvailableKey() returns Key 2 after Key 1 is exhausted',
  km.getNextAvailableKey() === 'unit_test_key_2'
);

km.markKeyExhausted('unit_test_key_2');

assert(
  'getNextAvailableKey() returns null when all keys are exhausted',
  km.getNextAvailableKey() === null
);

// ─── 2. Rotation simulation: axios patched ────────────────────────────────────

section('Rotation Simulation: HTTP 429 → Key 2 Fallback');

// Fresh env vars for the simulation keys
process.env.SEARCHAPI_API_KEY_1 = 'sim_key_1';
process.env.SEARCHAPI_API_KEY_2 = 'sim_key_2';

const keysAttempted: string[] = [];

// Patch axios.get BEFORE requiring google-ads (Node module cache means the
// patched instance is what google-ads.ts will use)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const axiosModule = require('axios');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
axiosModule.get = (url: string, config: any): Promise<unknown> => {
  const key: string = config?.params?.api_key ?? '';
  keysAttempted.push(key);

  if (key === 'sim_key_1') {
    // Simulate quota exceeded on Key 1
    const err = Object.assign(new Error('Request failed with status code 429'), {
      isAxiosError: true,
      response: { status: 429, data: { error: 'quota_exceeded' } },
    });
    return Promise.reject(err);
  }

  // Key 2 succeeds with a mock ad response
  return Promise.resolve({
    data: {
      ad_creatives: [
        {
          id: 'mock_ad_001',
          headline: 'Test Ad from Key 2',
          format: 'text',
          first_shown_datetime: '2024-01-01T00:00:00Z',
          last_shown_datetime: '2024-03-01T00:00:00Z',
        },
      ],
    },
  });
};

// Reload the key manager with fresh sim keys (clear require cache first)
delete require.cache[require.resolve('../src/lib/searchapi-key-manager')];
// eslint-disable-next-line @typescript-eslint/no-require-imports
const kmSim = require('../src/lib/searchapi-key-manager') as typeof import('../src/lib/searchapi-key-manager');

// Also reload google-ads so it picks up the patched axios + fresh key manager
delete require.cache[require.resolve('../src/scrapers/ads-intelligence/google-ads')];
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scrapeGoogleAds } = require('../src/scrapers/ads-intelligence/google-ads') as typeof import('../src/scrapers/ads-intelligence/google-ads');

void (async () => {
  const results = await scrapeGoogleAds('Test Business', {}, 'example.com');

  assert(
    'Key 1 was attempted first',
    keysAttempted[0] === 'sim_key_1',
    `first key used: ${keysAttempted[0]}`
  );

  assert(
    'Key 2 was attempted after Key 1 returned 429',
    keysAttempted[1] === 'sim_key_2',
    `second key used: ${keysAttempted[1]}`
  );

  assert(
    'scrapeGoogleAds returned results using Key 2',
    results.length > 0,
    `returned ${results.length} ad(s)`
  );

  assert(
    'getNextAvailableKey() still returns Key 2 (Key 1 is marked exhausted)',
    kmSim.getNextAvailableKey() === 'sim_key_2',
    `available key: ${kmSim.getNextAvailableKey()}`
  );

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('  Key rotation is working correctly.\n');
  } else {
    console.log('  Some checks failed — review output above.\n');
    process.exit(1);
  }
})();
