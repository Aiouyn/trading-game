// Display names for nameKeys (22 §3.3, Port Avalon). Content/i18n is not owned by Spec 2: this
// table stands in until the shell's string catalog resolves `district.<distId>` keys [P].
const NAMES: Record<string, string> = {
  'district.dist_port_avalon_eastside_docks': 'Eastside Docks',
  'district.dist_port_avalon_industrial_basin': 'Industrial Basin',
  'district.dist_port_avalon_old_harbor': 'Old Harbor',
  'district.dist_port_avalon_riverside_lofts': 'Riverside Lofts',
  'district.dist_port_avalon_midtown': 'Midtown',
  'district.dist_port_avalon_financial_mile': 'Financial Mile',
  'district.dist_port_avalon_glasshill': 'Glasshill',
  'district.dist_port_avalon_summit_estates_on_gilt_hill': 'Summit Estates on Gilt Hill',
};

export function districtName(nameKey: string): string {
  return NAMES[nameKey] ?? nameKey;
}
