/** Format integer cents as Money decimal string (2 dp). */
export function cashCentsToMoney(cashCents: number): string {
  const neg = cashCents < 0;
  const abs = Math.abs(cashCents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}
