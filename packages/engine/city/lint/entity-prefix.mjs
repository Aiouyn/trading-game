// T10A-01 AC-10A-01-2 (E-88 (2c), E-92 (3)): ESLint rule `no-noncompliant-entity-prefix`, run by this package's own config, so it covers
// packages/engine/city/** only (the shipped client's `city_port_avalon` is outside it, E-88 (2c)). It flags only the 5 pre-E-26 prefixes
// (`city_`, `dist_`, `unit_`, `loan_`, `uq_`) at any position of a string literal or of ANY template quasi (QA follow-up): the start of the
// literal, the start of every quasi, and every token start (a character that is not [A-Za-z0-9_] precedes it). The message names the E-26
// replacement. ALLOWED is the test's pass list, not a second gate (E-88 (2c), E-92 (3) Q1): no id-position allow check.
// The lists mirror ids.ts; schema.test.ts asserts they are equal.
export const NONCOMPLIANT = { city_: 'cty_', dist_: 'dst_', unit_: 'unt_', loan_: 'lon_', uq_: 'unq_' };
export const ALLOWED = [
  'cty_', 'dst_', 'pcl_', 'bld_', 'unt_', 'lse_', 'prop_', 'unq_', 'lon_', 'dyn_', 'pty_', 'cau_', 'bil_', 'ele_', 'lob_', 'hst_', 'fct_', 'sec_',
  'brf_', 'brk_', 'mac_', 'mcl_', 'dfe_', 'lot_', 'csa_', 'esc_', 'clm_', 'ccp_', 'lst_', 'dev_', 'ofr_', 'prm_', 'psl_', 'lau_', 'mqt_', 'obj_',
  'mrl_', 'pln_', 'rdp_', 'tof_', 'mrg_', 'vrd_', 'rst_', 'mot_', 'lbo_', 'ipo_', 'srf_', 'opn_', 'hsn_', 'lgc_', 'anm_', 'dcp_', 'itl_', 'lab_',
  'cls_', 'dts_', 'res_', 'run_', 'mdl_', 'dep_', 'grf_', 'lic_', 'rpj_', 'evl_', 'chn_', 'wir_', 'brd_', 'lgr_', 'chp_', 'chl_', 'riv_', 'itp_', 'ics_',
  'str_', 'per_', 'mfs_', 'arc_', 'msh_', 'sty_', 'mgp_', 'ctr_', 'wld_', 'trn_', 'evt_', 'rgn_'];   // E-92 (3): + 12 (73 → 85)

const DENY_RE = /(city_|dist_|unit_|loan_|uq_)/g;

/** Every deny-prefix that starts a token in `text`; `atStart` is true when index 0 is a position (literal or quasi start). */
function denyHits(text) {
  const out = [];
  for (const m of text.matchAll(DENY_RE)) {
    const i = m.index;
    if (i === 0 || !/[A-Za-z0-9_]/.test(text[i - 1])) out.push(m[1]);
  }
  return out;
}

const rule = {
  meta: {
    type: 'problem', schema: [],
    messages: { bad: "entity-id prefix '{{bad}}' is not E-26 compliant: use '{{good}}'" },
  },
  create(context) {
    const deny = (node, text) => {
      if (typeof text !== 'string') return;
      for (const bad of denyHits(text)) context.report({ node, messageId: 'bad', data: { bad, good: NONCOMPLIANT[bad] } });
    };
    return {
      Literal(node) { deny(node, node.value); },
      TemplateLiteral(node) { for (const q of node.quasis) deny(node, q.value.cooked); },
    };
  },
};

export const entityPrefixPlugin = { rules: { 'no-noncompliant-entity-prefix': rule } };
