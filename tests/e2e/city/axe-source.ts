// axe-core is present in node_modules (transitive via eslint-plugin-jsx-a11y), not a declared
// dependency. Declaring @axe-core/playwright (or axe-core) is a package.json change for Spec 1.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(__filename);
const source: string = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
export default source;
