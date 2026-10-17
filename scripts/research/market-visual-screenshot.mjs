import { chromium } from 'playwright';

const pools = [
  { ticker: 'POPCAT', chain: 'solana', pool: 'FRhB8L7Y9Qq41qZXYLtC2nw8An1RJfLLxRF2x9RwLLMo' },
  { ticker: 'BONK', chain: 'solana', pool: '5zpyutJu9ee6jFymDGoK7F6S5Kczqtc9FomP3ueKuyA9' },
  { ticker: 'FARTCOIN', chain: 'solana', pool: 'Bzc9NZfMqkXR6fz1DBph7BDf9BroyEf6pnzESP7v5iiw' },
  { ticker: 'TRUMP', chain: 'solana', pool: '9d9mb8kooFfaD3SctgZtkxQypkshx6ezhbKio89ixyy2' },
  { ticker: 'MOODENG', chain: 'solana', pool: '22WrmyTj8x2TRVQen3fxxi2r4Rn6JDHWoMTpsSmn8RUd' },
  { ticker: 'LIQUIFY', chain: 'solana', pool: '44wJGAHrSnegbgMkmZt4WTEKyBSD8shDfyQnZnjRCNpc' },
  { ticker: 'ROADSTER', chain: 'solana', pool: 'AW1NPKi2JC6zw17hUv4GttiMDECoengd6eWG62WRusFy' },
  { ticker: 'FORGE', chain: 'solana', pool: '5Y3XSiPWsKGaWihMztiDQ5L1XUo5jBopsY3UQyXHYkMH' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
for (const item of pools) {
  const url = `https://www.geckoterminal.com/${item.chain}/pools/${item.pool}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(9000);
    const title = await page.title();
    for (const [tf, x] of [['1m', 276], ['5m', 311]]) {
      await page.mouse.click(x, 106);
      await page.waitForTimeout(2500);
      const stamp = new Date().toISOString().replaceAll(':', '-');
      const path = `proof/memecoin-visual-20261015/real/${item.ticker}-${tf}.png`;
      await page.screenshot({ path });
      console.log(JSON.stringify({ ticker: item.ticker, tf, url, title, path, capturedAt: new Date().toISOString() }));
    }
  } catch (error) {
    console.log(JSON.stringify({ ticker: item.ticker, url, error: String(error) }));
  }
}
await browser.close();
