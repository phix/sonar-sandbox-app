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
import { fetchAllIssues, renderComment, explainAxes } from './pr-gate.mjs';

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


/**
 * The second misreading the reporting path produced.
 *
 * Counting resolved findings made a working remediation look like it had done
 * nothing. Reporting the gate as one verdict did the same thing by a different
 * route: every condition remediation governs has been green since the first
 * run, and the gate has been red the whole time on new-code coverage, which
 * remediation does not produce. Someone reading "gate: ERROR" after 18 fixes
 * concludes the fixes failed. They did not.
 */
const COVERAGE_BOUND = [
  { metricKey: 'new_reliability_rating', status: 'OK', actualValue: '1', comparator: 'GT', errorThreshold: '1' },
  { metricKey: 'new_maintainability_rating', status: 'OK', actualValue: '1', comparator: 'GT', errorThreshold: '1' },
  { metricKey: 'new_coverage', status: 'ERROR', actualValue: '5.7', comparator: 'LT', errorThreshold: '80' }
];

test('says plainly that fixing the findings will not turn this gate green', () => {
  const text = explainAxes(COVERAGE_BOUND);
  assert.match(text, /Every condition automated remediation governs is green/);
  assert.match(text, /new_coverage/);
  assert.match(text, /leave the gate exactly as it is/);
  // The claim it must NOT make: that the findings below are why it is red.
  assert.doesNotMatch(text, /the findings below are the thing to resolve/);
});

test('points at the findings when the gate is red for a reason remediation owns', () => {
  const text = explainAxes([
    { metricKey: 'new_maintainability_rating', status: 'ERROR', actualValue: '3', comparator: 'GT', errorThreshold: '1' }
  ]);
  assert.match(text, /the findings below are the thing to resolve/);
});

test('separates the two when both kinds of condition fail', () => {
  const text = explainAxes([
    ...COVERAGE_BOUND,
    { metricKey: 'new_duplicated_lines_density', status: 'ERROR', actualValue: '9', comparator: 'GT', errorThreshold: '3' }
  ]);
  assert.match(text, /two different kinds of condition/);
  assert.match(text, /will not move it/);
});

test('stays quiet when the gate passes', () => {
  assert.equal(explainAxes([{ metricKey: 'new_coverage', status: 'OK' }]), null);
});

test('the explanation reaches the comment a human actually reads', () => {
  const body = renderComment({
    status: 'ERROR',
    conditions: COVERAGE_BOUND,
    issues: [{ rule: 'javascript:S1481', severity: 'MINOR', component: 'k:api/src/store.js', line: 13 }],
    projectKey: 'k', pr: '2', dashboardUrl: 'https://example.test'
  });
  assert.match(body, /Every condition automated remediation governs is green/);
  // and it comes before the table, not buried under it
  assert.ok(body.indexOf('governs is green') < body.indexOf('| Condition |'));
});
