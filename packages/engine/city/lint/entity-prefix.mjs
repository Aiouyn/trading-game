// T10A-01 AC-10A-01-2 (+ QA follow-up, E-88): ESLint rule `no-noncompliant-entity-prefix`, run by this package's own config, so it covers
// packages/engine/city/** only (the shipped client's `city_port_avalon` is outside it, E-88 (2c)). Two checks:
//  (a) DENY: a pre-E-26 prefix (`city_`, `dist_`, `unit_`, `loan_`, `uq_`) at any position of a string literal or of ANY template quasi
//      (not only the head): the start of the literal, the start of every quasi, and every token start (a character that is not
//      [A-Za-z0-9_] precedes it). The message names the E-26 replacement.
//  (b) ALLOW: a literal in an entity-id position (the value of a property or variable named `id` / `…Id`, an element of a `…Ids` array, or
//      the argument of assertEntityId) whose head has the E-18 kind shape (`[a-z]{3}_`, `hh_`, `prop_`) must use a prefix from ALLOWED
//      (E-26…E-52, 73) or one of the ledger's ENTITY_KINDS (03, for owners, tenants and counterparties that 10A rows reference).
// The lists mirror ids.ts and ledger ENTITY_KINDS; schema.test.ts asserts they are equal.
export const NONCOMPLIANT = { city_: 'cty_', dist_: 'dst_', unit_: 'unt_', loan_: 'lon_', uq_: 'unq_' };
export const ALLOWED = [
  'cty_', 'dst_', 'pcl_', 'bld_', 'unt_', 'lse_', 'prop_', 'unq_', 'lon_', 'dyn_', 'pty_', 'cau_', 'bil_', 'ele_', 'lob_', 'hst_', 'fct_', 'sec_',
  'brf_', 'brk_', 'mac_', 'mcl_', 'dfe_', 'lot_', 'csa_', 'esc_', 'clm_', 'ccp_', 'lst_', 'dev_', 'ofr_', 'prm_', 'psl_', 'lau_', 'mqt_', 'obj_',
  'mrl_', 'pln_', 'rdp_', 'tof_', 'mrg_', 'vrd_', 'rst_', 'mot_', 'lbo_', 'ipo_', 'srf_', 'opn_', 'hsn_', 'lgc_', 'anm_', 'dcp_', 'itl_', 'lab_',
  'cls_', 'dts_', 'res_', 'run_', 'mdl_', 'dep_', 'grf_', 'lic_', 'rpj_', 'evl_', 'chn_', 'wir_', 'brd_', 'lgr_', 'chp_', 'chl_', 'riv_', 'itp_', 'ics_'];
/** packages/engine/ledger/src/types.ts ENTITY_KINDS, each + '_'. */
export const LEDGER_KIND_PREFIXES = ['sys_', 'cbk_', 'gov_', 'reg_', 'crt_', 'exc_', 'ccp_', 'rat_', 'bnk_', 'ins_', 'fnd_', 'spv_', 'cmp_', 'biz_',
  'prop_', 'ali_', 'npc_', 'hh_', 'frm_', 'row_', 'chr_'];

const DENY_RE = /(city_|dist_|unit_|loan_|uq_)/g;
const KIND_HEAD_RE = /^((?:[a-z]{3}|hh|prop)_)[A-Za-z0-9_]?/;
const OK = new Set([...ALLOWED, ...LEDGER_KIND_PREFIXES]);
const ID_NAME_RE = /^(?:id|.*Id)$/;
const IDS_NAME_RE = /^.*Ids$/;

/** Every deny-prefix that starts a token in `text`; `atStart` is true when index 0 is a position (literal or quasi start). */
function denyHits(text) {
  const out = [];
  for (const m of text.matchAll(DENY_RE)) {
    const i = m.index;
    if (i === 0 || !/[A-Za-z0-9_]/.test(text[i - 1])) out.push(m[1]);
  }
  return out;
}
const keyName = (k) => (k?.type === 'Identifier' ? k.name : k?.type === 'Literal' && typeof k.value === 'string' ? k.value : null);
function isIdPosition(node) {
  const p = node.parent;
  if (!p) return false;
  if (p.type === 'Property' && p.value === node) return ID_NAME_RE.test(keyName(p.key) ?? '');
  if (p.type === 'VariableDeclarator' && p.init === node) return p.id.type === 'Identifier' && ID_NAME_RE.test(p.id.name);
  if (p.type === 'CallExpression' && p.callee.type === 'Identifier' && p.callee.name === 'assertEntityId') return p.arguments[0] === node;
  if (p.type === 'ArrayExpression' && p.parent?.type === 'Property' && p.parent.value === p) return IDS_NAME_RE.test(keyName(p.parent.key) ?? '');
  return false;
}

const rule = {
  meta: {
    type: 'problem', schema: [],
    messages: {
      bad: "entity-id prefix '{{bad}}' is not E-26 compliant: use '{{good}}'",
      unknown: "entity-id prefix '{{bad}}' is not in the allowed list (AC-10A-01-2) or the ledger's ENTITY_KINDS",
    },
  },
  create(context) {
    const deny = (node, text) => {
      if (typeof text !== 'string') return;
      for (const bad of denyHits(text)) context.report({ node, messageId: 'bad', data: { bad, good: NONCOMPLIANT[bad] } });
    };
    const allow = (node, head) => {
      if (typeof head !== 'string' || !isIdPosition(node)) return;
      const m = KIND_HEAD_RE.exec(head);
      if (m && !OK.has(m[1]) && !(m[1] in NONCOMPLIANT)) context.report({ node, messageId: 'unknown', data: { bad: m[1] } });
    };
    return {
      Literal(node) { deny(node, node.value); allow(node, node.value); },
      TemplateLiteral(node) {
        for (const q of node.quasis) deny(node, q.value.cooked);
        allow(node, node.quasis[0]?.value.cooked);
      },
    };
  },
};

export const entityPrefixPlugin = { rules: { 'no-noncompliant-entity-prefix': rule } };
