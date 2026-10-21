// CLI for the 02#42 / E-68 / E-69 stream-key scan: `npm run ci:streams [-- --root <dir>]`. Exit 1 on any finding, 0 when clean.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from './scan-stream-keys';

const i = process.argv.indexOf('--root');
const root = i > 0 ? process.argv[i + 1]! : join(fileURLToPath(new URL('.', import.meta.url)), '../..');
process.exit(runCli(root));
