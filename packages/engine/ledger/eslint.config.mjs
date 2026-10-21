// G8 determinism lint for packages/engine/ledger/** (spec §2.6, acceptance test 7).
import tseslint from 'typescript-eslint';

export const G8_RULES = {
  'no-restricted-globals': ['error',
    { name: 'Date', message: 'G8: time is Tick only' }, { name: 'performance', message: 'G8: no wall clock' },
    { name: 'setTimeout', message: 'G8: no timers' }, { name: 'setInterval', message: 'G8: no timers' }, { name: 'setImmediate', message: 'G8: no timers' },
    { name: 'Promise', message: 'G8: no async' }, { name: 'Intl', message: 'G8: no Intl' }, { name: 'crypto', message: 'G8: no crypto randomness' },
    { name: 'Map', message: 'G8: use SortedMap (det.ts)' }, { name: 'Set', message: 'G8: use SortedMap / sorted arrays' }],
  'no-restricted-properties': ['error',
    { object: 'Math', property: 'random', message: 'G8: no Math.random' },
    { object: 'JSON', property: 'stringify', message: 'G8: hash and persist with canonEncode' },
    { property: 'localeCompare', message: 'G8: byte order only (cmpStr)' }],
  'no-restricted-syntax': ['error',
    { selector: 'ForInStatement', message: 'G8: no for…in' },
    { selector: 'FunctionDeclaration[async=true], ArrowFunctionExpression[async=true], FunctionExpression[async=true]', message: 'G8: no async' },
    { selector: "CallExpression[callee.object.name='Object'][callee.property.name=/^(keys|values|entries)$/]", message: 'G8: no Object.keys/values/entries order dependence' }],
};

export default tseslint.config(
  { ignores: ['node_modules/**'] },
  ...tseslint.configs.recommended,
  { files: ['src/**/*.ts'], rules: G8_RULES },
  { files: ['src/det.ts'], rules: { 'no-restricted-globals': 'off', 'no-restricted-syntax': 'off' } }, // the one SortedMap / canonEncode implementation (keys sorted)
);
