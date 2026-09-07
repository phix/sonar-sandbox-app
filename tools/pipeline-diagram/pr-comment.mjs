#!/usr/bin/env node
// Turns an `archify compare` receipt into the markdown the PR comment shows.
// Usage: node pr-comment.mjs site/receipt.json   (RUN_URL, PAGES_URL from env)
// A missing receipt means there was no base diagram to compare against.

import { existsSync, readFileSync } from 'node:fs';

export function render(receipt, { runUrl, pagesUrl }) {
  const lines = ['<!-- pipeline-diagram -->', '## Pipeline diagram', ''];
  if (!receipt) {
    lines.push('No diagram on the base branch yet, so there is nothing to diff. The rendered diagram for this PR is the `pipeline-diagram` artifact on ' + link('this run', runUrl) + '.');
    return lines.join('\n') + '\n';
  }
  const { summary, changes } = receipt;
  const counts = (s) => Object.entries(s).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ');
  const parts = [
    counts(summary.components) && `nodes: ${counts(summary.components)}`,
    counts(summary.connections) && `edges: ${counts(summary.connections)}`,
    counts(summary.boundaries) && `boundaries: ${counts(summary.boundaries)}`,
  ].filter(Boolean);
  const topology = ['added', 'removed'].some((k) => summary.components[k] > 0 || summary.connections[k] > 0);
  lines.push(
    topology ? `**Topology changed** — ${parts.join(' · ')}.`
      : parts.length ? `**Same topology, diagram changed** — ${parts.join(' · ')}.`
        : '**No change.** The workflows wire up the same way as on the base branch.',
  );
  lines.push('');
  const rows = [
    ...changes.components.map((c) => ['node', `\`${c.id}\``, c.status, c.changedFields.join(', ')]),
    ...changes.connections.map((c) => ['edge', `\`${c.id}\``, c.status, c.changedFields.join(', ')]),
    ...changes.boundaries.map((b) => ['boundary', `\`${b.label ?? b.id ?? ''}\``, b.status, (b.changedFields ?? []).join(', ')]),
  ];
  if (rows.length) {
    lines.push('| kind | id | status | changed |', '|---|---|---|---|');
    for (const r of rows) lines.push(`| ${r.join(' | ')} |`);
    lines.push('');
  }
  lines.push(`Delta and rendered diagram: the \`pipeline-diagram\` artifact on ${link('this run', runUrl)}. Live diagram from \`main\`: ${pagesUrl}`);
  return lines.join('\n') + '\n';
}

function link(text, url) {
  return url ? `[${text}](${url})` : text;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const path = process.argv[2];
  const receipt = path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  process.stdout.write(render(receipt, { runUrl: process.env.RUN_URL, pagesUrl: process.env.PAGES_URL }));
}
