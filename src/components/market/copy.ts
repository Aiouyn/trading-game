// Words from the sim that read like a command line or a debug figure, put the way a player would say them.
// The sim's own text stays as it is; the desk cleans it on the way to the screen.

export function plainCopy(text: string): string {
  return text
    // the short-selling refusal names a console command
    .replace(/open one with borrow AMOUNT margin(?:\|line\|term)?/gi, "open one in Bank & Credit by borrowing against your shares")
    .replace(/borrow AMOUNT margin(?:\|line\|term)?/gi, "borrow against your shares in Bank & Credit")
    // "8.0% for the 11111% of a year's income you owe": a person with no income owes a meaningless multiple
    .replace(/for the (\d+)% of a year's income you owe/gi, (_, n: string) => (Number(n) >= 300 ? "for owing far more than a year's income" : `for owing ${n}% of a year's income`))
    .replace(/\bso try again\b/gi, "then try again")
    // a bare amount in a bank reply is dollars
    .replace(/\b(Borrowed|Repaid|Deposited|Withdrew|Withdrawn) (\d[\d,]*(?:\.\d+)?)(?=\s|\.|,|$)/gi, (_, v: string, n: string) => `${v} $${Number(n.replace(/,/g, "")).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
}
