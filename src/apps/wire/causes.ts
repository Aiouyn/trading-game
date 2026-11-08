// M1-09 cause → consequence copy for the server's stories, by WireItem.causeKey. Only the Wire detail (lazy Wire chunk)
// imports it, so the Broker route does not carry it. EN for both locales: [P] FR copy pending (Studio).
import type { WireItem } from "@/shell/contracts/channels";

export const CAUSES: Readonly<Record<string, string>> = {
    "wire.cause.halc-volumes": "Halcyon Shipping carried more cargo than expected this quarter. Higher earnings lift the stock.",
    "wire.cause.volt-guidance": "Voltaic Grid expects more demand for the rest of the year. Higher expected profits lift the stock.",
    "wire.cause.tide-downgrade": "Talk that Tidewater REIT's rating will be cut. Even unconfirmed, the rumor weighs on the price.",
    "wire.cause.orca-trial": "Orca Biologics' lead drug missed its trial goal. Lost future sales take value out of the stock.",
    "wire.cause.nmbs-contract": "Nimbus Compute won a large multi-year computing contract. New revenue lifts the stock.",
    "wire.cause.kiln-demand": "Kiln Materials sees weaker building demand. Lower expected sales push the stock down.",
    "wire.cause.mrdn-recall": "Meridian Foods recalls a product line. Costs and lost sales weigh on the stock.",
    "wire.cause.avb-earnings": "Avalon Bank earned more on its loans than expected. The stock rises.",
    "wire.cause.oil-watch": "Tension over crude supply is rising. If supply is cut, energy producers would gain and fuel-hungry shipping and materials firms would lose.",
    "wire.cause.oil-hit": "Crude supply was cut. Verdane Energy gains on higher oil prices; Halcyon Shipping and Kiln Materials pay more for fuel and energy.",
    "wire.cause.oil-eased": "Crude supply held up. The risk passed.",
    "wire.cause.bank-watch": "Banks are paying more to borrow from each other, a sign of funding strain. A run would hit bank and property stocks.",
    "wire.cause.bank-hit": "Depositors pulled money from weaker banks. Avalon Bank falls; Tidewater REIT and the Gilt Exchange Index follow.",
    "wire.cause.bank-eased": "Funding strain faded. The risk passed.",
    "wire.cause.tech-watch": "Tech valuations are stretched far above earnings. A sharp correction could follow.",
    "wire.cause.tech-hit": "The tech rally broke. Nimbus Compute drops and the index slips with it.",
    "wire.cause.tech-eased": "Tech valuations cooled without a break. The risk passed.",
    "wire.cause.credit-watch": "Lenders are tightening loan terms. Borrowers such as property firms would be hit first.",
    "wire.cause.credit-hit": "Credit dried up. Tidewater REIT falls hardest; Avalon Bank and Kiln Materials slip.",
    "wire.cause.credit-eased": "Lending conditions steadied. The risk passed.",
};

/** Cause → consequence copy for a server story; null when the item has none (fixtures) or the key is unknown. */
export const causeText = (item: WireItem): string | null =>
  item.causeKey !== undefined && Object.hasOwn(CAUSES, item.causeKey) ? CAUSES[item.causeKey]! : null;
