/**
 * The first test of the reporting path.
 *
 * `fetchAllIssues` shipped without a status filter, so it counted findings the
 * pipeline had already fixed: after a remediation run the comment announced 32
 * code smells when 14 were open, and after a demo-reset it announced 50 — the
 * 32 planted findings plus the 18 that remediation had closed and the reset
 * resurrected. Sonar keeps closed issues on a pull request's analysis, so the
 * unfiltered query grows every cycle.
 *
 * Nothing exercised this path, which is why it survived. These tests stub
 * `fetch` rather than the module's own `api`, so the URL under assertion is the
 * one the real code builds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllIssues, renderComment } from './pr-gate.mjs';

/** Capture every URL requested, replying with the given pages in order. */
function stubFetch(pages) {
  const urls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    const body = pages[urls.length - 1] ?? { issues: [], paging: { total: 0 } };
    return { ok: true, status: 200, json: async () => body };
  };
  return { urls, restore: () => { globalThis.fetch = original; } };
}

test('fetchAllIssues asks Sonar only for findings that are still open', async () => {
  const f = stubFetch([{ issues: [], paging: { total: 0 } }]);
  try {
    await fetchAllIssues('https://sonarcloud.io', 'phix_sonar-sandbox-app', '2');
  } finally {
    f.restore();
  }

  assert.equal(f.urls.length, 1);
  assert.match(f.urls[0], /statuses=OPEN,CONFIRMED,REOPENED/,
    'without a status filter the comment counts findings that were already fixed');
});

test('fetchAllIssues follows pagination to the end', async () => {
  const issue = (key) => ({ key, rule: 'javascript:S1481', severity: 'MINOR', component: 'p:a.js', line: 1, message: 'm' });
  const f = stubFetch([
    { issues: [issue('a')], paging: { total: 2 } },
    { issues: [issue('b')], paging: { total: 2 } },
  ]);
  let issues;
  try {
    issues = await fetchAllIssues('https://sonarcloud.io', 'k', '2');
  } finally {
    f.restore();
  }

  assert.deepEqual(issues.map((i) => i.key), ['a', 'b']);
  assert.match(f.urls[1], /[?&]p=2\b/, 'the second request must ask for page 2');
});

test('the comment counts exactly the findings it was handed', () => {
  const issues = Array.from({ length: 32 }, (_, n) => ({
    key: `k${n}`, rule: 'javascript:S1481', severity: 'MINOR',
    component: 'phix_sonar-sandbox-app:api/src/store.js', line: n + 1, message: 'unused',
  }));

  const body = renderComment({
    status: 'ERROR', conditions: [], issues,
    projectKey: 'k', pr: '2', dashboardUrl: 'https://example.invalid',
  });

  assert.match(body, /\*\*32 code smells in 1 rule group\.\*\*/);
});

test('a clean pull request says so instead of rendering an empty table', () => {
  const body = renderComment({
    status: 'OK', conditions: [], issues: [],
    projectKey: 'k', pr: '2', dashboardUrl: 'https://example.invalid',
  });

  assert.match(body, /No code smells reported on this pull request\./);
  assert.match(body, /passed/);
});
