// Waits until a URL answers (any HTTP status), then exits 0. playwright.config.ts uses it so a close web app starts only after
// the main web app has built: `node tests/e2e/awaitUrl.mjs http://localhost:3200/ && npx next start -p 3600`.
// Usage: node tests/e2e/awaitUrl.mjs <url> [timeoutSeconds=400]

const url = process.argv[2];
const timeoutMs = Number(process.argv[3] ?? 400) * 1000;
if (!url) {
  console.error('awaitUrl: give a URL');
  process.exit(2);
}

const started = Date.now();
for (;;) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5_000) });
    process.exit(0);
  } catch {
    // not up yet
  }
  if (Date.now() - started > timeoutMs) {
    console.error(`awaitUrl: ${url} did not answer within ${timeoutMs / 1000} s`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1_000));
}
