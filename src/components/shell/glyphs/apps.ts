// App glyph path data (17 §3.15). Studio's 12 originals (design/redesign/src/glyphs.js) plus the 20 drawn in 17A T2.
import type { AppId } from "@/shell/registry";

export const broker = ["M8 3.5v3.5M8 15v5.5M16 5.5V10M16 16v3", "M6.6 7h2.8a.6.6 0 0 1 .6.6v6.8a.6.6 0 0 1-.6.6H6.6a.6.6 0 0 1-.6-.6V7.6a.6.6 0 0 1 .6-.6zM14.6 10h2.8a.6.6 0 0 1 .6.6v4.8a.6.6 0 0 1-.6.6h-2.8a.6.6 0 0 1-.6-.6v-4.8a.6.6 0 0 1 .6-.6z"] as const;
export const portfolio = ["M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5z", "M12 3.75V12h8.25"] as const;
export const wire = ["M8.5 7.5h11M8.5 12h11M8.5 16.5h7", "M5 7.5h.01M5 12h.01M5 16.5h.01"] as const;
export const businesses = ["M4 9.5h16M5.5 4.5h13L20 9.5M5.5 4.5 4 9.5M5.5 9.5v10h13v-10M10.25 19.5v-5h3.5v5"] as const;
export const ailab = ["M6 4.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5zM18 4.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5zM12 15.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5z", "M8.25 7h7.5M7.1 9 10.9 16M16.9 9l-3.8 7"] as const;
export const research = ["M11 20.5H5.5v-17h8l4 4V10M13.5 3.5v4h4", "M15.5 12.25a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5zM18 18l2.75 2.75"] as const;
export const bank = ["M3.5 9 12 4l8.5 5zM6 11.5v6M10 11.5v6M14 11.5v6M18 11.5v6M3.5 20h17"] as const;
export const legal = ["M12 4v15.5M8 19.5h8M5 7.5h14M5 7.5 2.75 13.25h4.5zM19 7.5l-2.25 5.75h4.5z"] as const;
export const security = ["M12 3.25 19 6v5.25c0 4.5-3 7.9-7 9.5-4-1.6-7-5-7-9.5V6z", "M12 10.25v3.5M12 9.5h.01"] as const;
export const messages = ["M4 5h16v11H10.5L6.5 19.25V16H4z", "M8 9h8M8 12h5"] as const;
export const settings = ["M4 7h3M11 7h9M4 12h9M17 12h3M4 17h1M9 17h11", "M9 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM15 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"] as const;
export const company = ["M7 20.5v-16h10v16M4 20.5h16M10 8h1M13 8h1M10 11.5h1M13 11.5h1M10 15h1M13 15h1"] as const;
// 17A T2: drawn to Studio's glyph rules (17 §3.15): 24 px grid, 1.5 px single weight, round caps and joins,
// no fills except dots (h.01 strokes), no real-OS idioms. Pending Studio sign-off.
export const markets = ["M4 19.5h16", "M5.5 15.5 9.5 11l3 3 5.5-6.5"] as const;
export const risk = ["M4.5 16a7.5 7.5 0 0 1 15 0", "M12 16l3.5-4.5", "M12 16h.01"] as const;
export const quantlab = ["M9.5 4h5M10.5 4v5.5L5.5 18a1.5 1.5 0 0 0 1.3 2.2h10.4a1.5 1.5 0 0 0 1.3-2.2L13.5 9.5V4", "M8 15h8"] as const;
export const property = ["M4.5 11 12 5l7.5 6", "M6.5 9.5v10h11v-10", "M10.5 19.5V15h3v4.5"] as const;
export const city = ["M3.5 20.5h17", "M5 20.5v-8h4v8M9 20.5v-14h5v14M14 20.5v-10h5v10", "M11.5 10h.01M11.5 13.5h.01"] as const;
export const funds = ["M12 4.5l8 4-8 4-8-4z", "M4 12.5l8 4 8-4", "M4 16.5l8 4 8-4"] as const;
export const insurance = ["M3.5 12a8.5 8.5 0 0 1 17 0z", "M12 12v5.5a2 2 0 0 1-4 0", "M12 2.5v1"] as const;
export const institutions = ["M10 4h4v4h-4z", "M12 8v3.5M6 11.5h12M6 11.5V14M18 11.5V14M12 11.5V14", "M4.5 14h3v4h-3zM10.5 14h3v4h-3zM16.5 14h3v4h-3z"] as const;
/** Estate (Studio T2 ruling 2): a key — not a document, distinct from Contracts and Property. */
export const estate = ["M7.5 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z", "M11 12h9.5M17.5 12v3M20.5 12v2.5", "M7.5 12h.01"] as const;
export const boards = ["M4 11h16", "M6 11v6M18 11v6", "M8 7.5h.01M12 7.5h.01M16 7.5h.01"] as const;
export const profile = ["M12 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z", "M5 19.5c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5"] as const;
export const alliance = ["M9 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z", "M15 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"] as const;
export const contracts = ["M6 3.5h8.5L18 7v13.5H6z", "M14.5 3.5V7H18", "M8.5 11h7M8.5 14h4", "M8.5 17.5c1-1 1.8-1 2.5 0s1.5 1 2.5 0"] as const;
export const auctions = ["M13 4.5l5 5M11.5 6l5 5", "M14.25 7.75 7 15", "M5.5 13.5l3 3", "M4 20.5h9"] as const;
export const civic = ["M4 20.5h16", "M6 20.5v-7h12v7", "M7 13.5a5 5 0 0 1 10 0", "M12 8.5V4l3 1-3 1"] as const;
export const academy = ["M2.75 9.5 12 5l9.25 4.5L12 14z", "M6.5 11.5V16c1.5 1.3 3.5 2 5.5 2s4-.7 5.5-2v-4.5", "M21.25 9.5v5"] as const;
export const help = ["M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5z", "M9.75 9.5a2.25 2.25 0 1 1 3.4 1.95c-.7.4-1.15.9-1.15 1.7v.35", "M12 16.5h.01"] as const;
export const atelier = ["M12 3.5v2", "M5.5 5.5h13v9h-13z", "M8 20.5l2.5-6M16 20.5l-2.5-6"] as const;
export const replay = ["M4.5 12a7.5 7.5 0 1 0 2.2-5.3", "M4.5 4.5V8H8", "M10.5 9.5v5l4-2.5z"] as const;
export const api = ["M8.5 7 4 12l4.5 5", "M15.5 7 20 12l-4.5 5", "M13.25 6.5l-2.5 11"] as const;

export const APP_GLYPHS: Record<AppId, readonly string[]> = { broker, portfolio, wire, businesses, ailab, research, bank, legal, security, messages, settings, company, markets, risk, quantlab, property, city, funds, insurance, institutions, estate, boards, profile, alliance, contracts, auctions, civic, academy, help, atelier, replay, api };

