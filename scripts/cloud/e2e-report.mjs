#!/usr/bin/env node
// Merges the JSON reports of a sharded e2e run (scripts/cloud/e2e-shards.sh) and lists what needs a rerun.
//
//   node scripts/cloud/e2e-report.mjs summarize <outRoot> <reportName>...   merged counts + failed list, exit 1 on failure
//   node scripts/cloud/e2e-report.mjs failed <outRoot>                     TSV of the failed tests of <outRoot>/summary.json
//   node scripts/cloud/e2e-report.mjs verdict <json>                       TIMING-ONLY | REAL | NOT RUN for one rerun report
//
// A report is <outRoot>/<reportName>.json (the Playwright JSON reporter). "Did not run" is a test with no result at all: a
// project that never started (a failed dependency, an interrupted run). A missing report counts as a failure.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [mode, ...args] = process.argv.slice(2);

/** Every spec of a Playwright JSON report, flattened to one row per (spec, project). */
function rows(report) {
  const out = [];
  const walk = (suite, parentFile) => {
    const file = suite.file ?? parentFile;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        out.push({
          project: test.projectName ?? '',
          file: spec.file ?? file ?? '',
          title: spec.title,
          status: test.status,
          results: test.results ?? [],
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, file);
  };
  for (const suite of report.suites ?? []) walk(suite, undefined);
  return out;
}

/** The repo path of a report's file (the JSON reporter writes paths relative to the test directory). */
function repoPath(file) {
  return file.startsWith('tests/') ? file : `tests/e2e/${file}`;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');

function classify(row) {
  if (row.status === 'expected') return 'passed';
  if (row.status === 'unexpected') return 'failed';
  if (row.status === 'flaky') return 'flaky';
  return row.results.length === 0 ? 'didNotRun' : 'skipped';
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

if (mode === 'summarize') {
  const [outRoot, ...names] = args;
  const totals = { passed: 0, failed: 0, didNotRun: 0, skipped: 0, flaky: 0 };
  const failedTests = [];
  const missing = [];
  const perReport = [];
  for (const name of names) {
    const path = join(outRoot, `${name}.json`);
    if (!existsSync(path)) {
      missing.push(name);
      continue;
    }
    const all = rows(readJson(path));
    const counts = { passed: 0, failed: 0, didNotRun: 0, skipped: 0, flaky: 0 };
    for (const row of all) {
      const k = classify(row);
      counts[k] += 1;
      totals[k] += 1;
      if (k === 'failed') {
        const error = row.results.find((r) => r.error)?.error?.message?.split('\n')[0] ?? '';
        failedTests.push({ project: row.project, file: repoPath(row.file), title: row.title, grep: `${escapeRe(row.title)}$`, error });
      }
    }
    perReport.push({ name, ...counts });
  }
  const wall = Number(process.env.E2E_WALL_SECONDS ?? 0);
  const summary = { ...totals, missing, wallSeconds: wall, perReport, failedTests };
  writeFileSync(join(outRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

  for (const r of perReport) {
    console.log(`  ${r.name}: ${r.passed} passed, ${r.failed} failed, ${r.didNotRun} did not run, ${r.skipped} skipped, ${r.flaky} flaky`);
  }
  for (const name of missing) console.log(`  ${name}: NO REPORT (the run did not finish; see ${join(outRoot, `${name}.log`)})`);
  console.log('');
  console.log(
    `E2E: ${totals.passed} passed, ${totals.failed} failed, ${totals.didNotRun} did not run, ${totals.skipped} skipped, ${totals.flaky} flaky` +
      (wall ? `, wall ${Math.floor(wall / 60)}m${String(wall % 60).padStart(2, '0')}s` : ''),
  );
  if (failedTests.length) {
    console.log(`FAILED (${failedTests.length}):`);
    for (const t of failedTests) console.log(`  [${t.project}] ${t.file} > ${t.title}${t.error ? `  -- ${t.error}` : ''}`);
  }
  const bad = totals.failed + totals.didNotRun + missing.length;
  process.exit(bad ? 1 : 0);
}

if (mode === 'failed') {
  const [outRoot] = args;
  const summary = JSON.parse(readFileSync(join(outRoot, 'summary.json'), 'utf8'));
  for (const t of summary.failedTests) {
    process.stdout.write(`${t.project}\t${t.file}\t${t.grep}\t${t.title}\n`);
  }
  process.exit(0);
}

if (mode === 'verdict') {
  const [path] = args;
  if (!existsSync(path)) {
    console.log('NOT RUN');
    process.exit(0);
  }
  const all = rows(readJson(path));
  const failed = all.filter((r) => classify(r) === 'failed').length;
  const passed = all.filter((r) => ['passed', 'flaky'].includes(classify(r))).length;
  console.log(failed ? 'REAL' : passed ? 'TIMING-ONLY' : 'NOT RUN');
  process.exit(0);
}

console.error('usage: e2e-report.mjs summarize <outRoot> <reportName>... | failed <outRoot> | verdict <json>');
process.exit(2);
