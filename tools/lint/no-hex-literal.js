// ESLint rule: no colour literals in src/**/*.{ts,tsx} (Spec 1 §9, V3 17-AT-01).
// Allowlist (configured in eslint.config.mjs): src/styles/tokens.ts, generated from tokens.css.
const HEX = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;
const FN = /\b(?:rgba?|hsla?)\(/i;

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow hex, rgb(), rgba() and hsl() colour literals; use tokens.css variables." },
    messages: { colour: "Colour literal '{{text}}' is not allowed; use a token from src/styles/tokens.css." },
    schema: [],
  },
  create(context) {
    const check = (node, text) => {
      const m = HEX.exec(text) ?? FN.exec(text);
      if (m) context.report({ node, messageId: "colour", data: { text: m[0] } });
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};

module.exports = { rules: { "no-hex-literal": rule } };
