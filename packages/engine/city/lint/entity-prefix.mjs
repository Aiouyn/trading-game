// T10A-01 AC-10A-01-2: ESLint rule `no-noncompliant-entity-prefix`. A string literal or the head of a template literal that starts with a
// pre-E-26 entity prefix (`city_`, `dist_`, `unit_`, `loan_`, `uq_`) is an error; the message names the E-26 replacement.
// The lists mirror ids.ts (ALLOWED_ENTITY_PREFIXES / NONCOMPLIANT_ENTITY_PREFIXES); schema.test.ts asserts they are equal.
export const NONCOMPLIANT = { city_: 'cty_', dist_: 'dst_', unit_: 'unt_', loan_: 'lon_', uq_: 'unq_' };
export const ALLOWED = [
  'cty_', 'dst_', 'pcl_', 'bld_', 'unt_', 'lse_', 'prop_', 'unq_', 'lon_', 'dyn_', 'pty_', 'cau_', 'bil_', 'ele_', 'lob_', 'hst_', 'fct_', 'sec_',
  'brf_', 'brk_', 'mac_', 'mcl_', 'dfe_', 'lot_', 'csa_', 'esc_', 'clm_', 'ccp_', 'lst_', 'dev_', 'ofr_', 'prm_', 'psl_', 'lau_', 'mqt_', 'obj_',
  'mrl_', 'pln_', 'rdp_', 'tof_', 'mrg_', 'vrd_', 'rst_', 'mot_', 'lbo_', 'ipo_', 'srf_', 'opn_', 'hsn_', 'lgc_', 'anm_', 'dcp_', 'itl_', 'lab_',
  'cls_', 'dts_', 'res_', 'run_', 'mdl_', 'dep_', 'grf_', 'lic_', 'rpj_', 'evl_', 'chn_', 'wir_', 'brd_', 'lgr_', 'chp_', 'chl_', 'riv_', 'itp_', 'ics_'];

const RE = /^(city_|dist_|unit_|loan_|uq_)/;

const rule = {
  meta: { type: 'problem', schema: [], messages: { bad: "entity-id prefix '{{bad}}' is not E-26 compliant: use '{{good}}'" } },
  create(context) {
    const check = (node, text) => {
      const m = typeof text === 'string' ? RE.exec(text) : null;
      if (m) context.report({ node, messageId: 'bad', data: { bad: m[1], good: NONCOMPLIANT[m[1]] } });
    };
    return {
      Literal(node) { check(node, node.value); },
      TemplateLiteral(node) { check(node, node.quasis[0]?.value.cooked); },
    };
  },
};

export const entityPrefixPlugin = { rules: { 'no-noncompliant-entity-prefix': rule } };
