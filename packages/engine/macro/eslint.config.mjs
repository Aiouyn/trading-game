// G8 determinism lint for packages/engine/macro/** (same rules as packages/engine/core, GLOBAL-CONTEXT G8).
import tseslint from 'typescript-eslint';

const MATH_FORBIDDEN = ['random', 'exp', 'log', 'log2', 'log10', 'log1p', 'expm1', 'pow', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'cbrt', 'hypot', 'round'];

export const G8_RULES = {
  'no-restricted-globals': ['error',
    ...['Date', 'performance', 'setTimeout', 'setInterval', 'setImmediate', 'Promise', 'Intl', 'crypto', 'process', 'globalThis',
      'WeakMap', 'WeakRef', 'Map', 'Set'].map((name) => ({ name, message: `G8: ${name} is forbidden in engine code` }))],
  'no-restricted-properties': ['error',
    ...MATH_FORBIDDEN.map((property) => ({ object: 'Math', property, message: `G8: Math.${property} is forbidden (use dmath / roundHalfEven)` })),
    { object: 'JSON', property: 'stringify', message: 'G8: hash and persist with canonEncode' },
    { property: 'localeCompare', message: 'G8: byte order only (cmpStr)' },
    { property: 'toLocaleString', message: 'G8: no locale formatting' }],
  'no-restricted-syntax': ['error',
    { selector: 'ForInStatement', message: 'G8: no for…in' },
    { selector: 'AwaitExpression, FunctionDeclaration[async=true], ArrowFunctionExpression[async=true], FunctionExpression[async=true]', message: 'G8: no async' },
    { selector: "CallExpression[callee.object.name='Object'][callee.property.name=/^(keys|values|entries)$/]", message: 'G8: no Object.keys/values/entries order dependence' },
    { selector: "CallExpression[callee.property.name='sort'][arguments.length=0]", message: 'G8: sort needs a total comparator (use sortBy)' }],
};

export default tseslint.config(
  { ignores: ['node_modules/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
  { files: ['**/*.ts'], ignores: ['**/*.test.ts'], rules: G8_RULES },
);
