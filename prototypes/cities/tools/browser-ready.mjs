export async function ready(page, url, timeout = 60000) {
  const errors = [];
  let rejectError;
  const fatal = new Promise((_, reject) => { rejectError = reject; });
  const fail = (message) => {
    errors.push(message);
    rejectError(new Error(message));
  };
  page.on('pageerror', e => fail(String(e)));
  page.on('console', m => {
    if (m.type() === 'error') fail(m.text());
  });
  // Start racing before navigation so early module errors are observed.
  await Promise.race([
    (async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      await page.waitForFunction(() => !!window.__cities?.city, null, { timeout });
      await page.evaluate(() => window.__cities.flushChunks?.());
      await page.waitForFunction(() => window.__cities?.view?.chunksReady === true, null, { timeout });
    })(),
    fatal,
  ]);
  return errors;
}
