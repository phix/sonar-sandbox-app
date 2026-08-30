/**
 * Turn a finished Sonar PR analysis into a verdict and a legible PR comment.
 *
 * The scan action submits the analysis and returns immediately; the server is
 * still computing when it does. So this waits for the compute-engine task,
 * reads the quality gate, lists the findings, and exits non-zero if the gate
 * is anything other than OK.
 *
 * The exit code is load-bearing: the job's conclusion IS the required status
 * check on main. Nothing here posts a commit status of its own, because a
 * second status is a second thing that can disagree with the first.
 *
 * Reads are anonymous-capable — the sandbox project is public — but use
 * SONAR_TOKEN when present. The token is never printed.
 *
 * Usage:  node .github/scripts/pr-gate.mjs <report-task.txt> <pr-number>
 */
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [reportPath, prNumber] = process.argv.slice(2);

const TOKEN = process.env.SONAR_TOKEN || '';
const POLL_TIMEOUT_MS = Number(process.env.GATE_TIMEOUT_MS || 300_000);
const POLL_INTERVAL_MS = 5_000;

/** report-task.txt is `key=value` per line, written by the scanner. */
export function readReportTask(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export async function api(url) {
  const headers = { Accept: 'application/json' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    // Never echo the URL with credentials; the URL itself carries none.
    throw new Error(`GET ${url} -> HTTP ${res.status}`);
  }
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait for the compute-engine task. A PENDING task is not a green gate, and
 * treating "not finished yet" as success is the exact failure this project
 * exists to argue against.
 */
export async function waitForTask(ceTaskUrl) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let last = '';
  while (Date.now() < deadline) {
    const { task } = await api(ceTaskUrl);
    if (task.status !== last) {
      console.log(`analysis task: ${task.status}`);
      last = task.status;
    }
    if (task.status === 'SUCCESS') return task;
    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      throw new Error(`analysis task ${task.status}: ${task.errorMessage || 'no message'}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`analysis task did not finish within ${POLL_TIMEOUT_MS}ms`);
}

export async function fetchAllIssues(base, projectKey, pr) {
  const issues = [];
  let page = 1;
  for (;;) {
    const url = `${base}/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}`
      + `&pullRequest=${encodeURIComponent(pr)}&types=CODE_SMELL&ps=500&p=${page}`;
    const body = await api(url);
    issues.push(...(body.issues || []));
    const total = body.paging?.total ?? body.total ?? issues.length;
    if (issues.length >= total || (body.issues || []).length === 0) break;
    page += 1;
  }
  return issues;
}

export const SEVERITY_ORDER = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];

export function renderComment({ status, conditions, issues, projectKey, pr, dashboardUrl }) {
  const verdict = status === 'OK'
    ? '### ✅ Sonar quality gate: **passed**'
    : `### ❌ Sonar quality gate: **${status}**`;

  const lines = [
    '<!-- sonar-pr-gate -->',
    verdict,
    '',
  ];

  if (conditions.length) {
    lines.push('| Condition | Status | Actual | Threshold |', '|---|---|---|---|');
    for (const c of conditions) {
      lines.push(`| \`${c.metricKey}\` | ${c.status === 'OK' ? 'ok' : '**' + c.status + '**'} `
        + `| ${c.actualValue ?? '—'} | ${c.comparator ?? ''} ${c.errorThreshold ?? '—'} |`);
    }
    lines.push('');
  }

  if (issues.length === 0) {
    lines.push('No code smells reported on this pull request.');
  } else {
    // Group by rule so the comment reads as "what kind of problem, how much of
    // it" rather than a flat wall of 32 lines.
    const byRule = new Map();
    for (const i of issues) {
      if (!byRule.has(i.rule)) byRule.set(i.rule, []);
      byRule.get(i.rule).push(i);
    }
    const rules = [...byRule.entries()].sort((a, b) => {
      const sa = SEVERITY_ORDER.indexOf(a[1][0].severity);
      const sb = SEVERITY_ORDER.indexOf(b[1][0].severity);
      return sa - sb || b[1].length - a[1].length;
    });

    lines.push(`**${issues.length} code smell${issues.length === 1 ? '' : 's'} `
      + `in ${rules.length} rule group${rules.length === 1 ? '' : 's'}.**`, '');
    lines.push('| Rule | Severity | Count | Where |', '|---|---|---|---|');
    for (const [rule, list] of rules) {
      const where = [...new Set(list.map((i) => i.component.split(':').pop()))]
        .slice(0, 3).join(', ');
      const more = new Set(list.map((i) => i.component)).size > 3 ? ', …' : '';
      lines.push(`| \`${rule}\` | ${list[0].severity} | ${list.length} | ${where}${more} |`);
    }
    lines.push('');
    lines.push('<details><summary>Every finding</summary>', '');
    for (const [rule, list] of rules) {
      lines.push(`**\`${rule}\`**`, '');
      for (const i of list.sort((a, b) => (a.line || 0) - (b.line || 0))) {
        lines.push(`- \`${i.component.split(':').pop()}:${i.line ?? '?'}\` — ${i.message}`);
      }
      lines.push('');
    }
    lines.push('</details>');
  }

  lines.push('', `[Full analysis on SonarQube Cloud](${dashboardUrl})`);
  lines.push('', '<sub>Posted by `sonar-pr-scan`. This comment is rewritten in place on every scan.</sub>');
  return lines.join('\n');
}

export async function main() {
  if (!reportPath || !prNumber) {
    console.error('usage: pr-gate.mjs <report-task.txt> <pr-number>');
    process.exit(2);
  }
  const report = readReportTask(reportPath);
  const base = (report.serverUrl || 'https://sonarcloud.io').replace(/\/$/, '');
  const projectKey = process.env.SONAR_PROJECT_KEY || report.projectKey;
  if (!projectKey) throw new Error('no project key in report-task.txt or SONAR_PROJECT_KEY');

  await waitForTask(report.ceTaskUrl);

  const gateUrl = `${base}/api/qualitygates/project_status?projectKey=${encodeURIComponent(projectKey)}`
    + `&pullRequest=${encodeURIComponent(prNumber)}`;
  const { projectStatus } = await api(gateUrl);
  const status = projectStatus.status;
  const conditions = projectStatus.conditions || [];

  const issues = await fetchAllIssues(base, projectKey, prNumber);
  const dashboardUrl = `${base}/project/issues?id=${encodeURIComponent(projectKey)}&pullRequest=${encodeURIComponent(prNumber)}`;

  const comment = renderComment({ status, conditions, issues, projectKey, pr: prNumber, dashboardUrl });
  writeFileSync('pr-comment.md', comment);

  // The job summary makes the verdict visible without opening the PR.
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, comment + '\n');
  }

  console.log(`quality gate: ${status}`);
  console.log(`code smells on PR #${prNumber}: ${issues.length}`);
  for (const c of conditions.filter((c) => c.status !== 'OK')) {
    console.log(`  failing condition: ${c.metricKey} ${c.actualValue} ${c.comparator} ${c.errorThreshold}`);
  }

  if (status !== 'OK') {
    console.log('::error::Sonar quality gate did not pass — this pull request is blocked.');
    process.exit(1);
  }

}

// Run only when invoked directly, so the helpers above stay unit-testable.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
