import { chromium } from 'playwright';
const backend = process.argv[2];
const browser = await chromium.launch({ args: backend ? [`--use-angle=${backend}`, '--enable-gpu'] : [] });
try {
  const page = await browser.newPage();
  console.log(JSON.stringify(await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return { webgl2: false };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { webgl2: true, renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER), vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR) };
  }), null, 2));
} finally { await browser.close(); }
