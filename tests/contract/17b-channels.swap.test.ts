// 17B CH-00 CH-06 SWAP: skipped until 19C `packages/protocol` exists. When it lands, this file must assert for every
// body `expectTypeOf<X>().toEqualTypeOf<protocol.X>()` and replay recorded gateway frames through openChannel.
// (The type assertions can't be written before the module exists without breaking typecheck; the swap card adds
// them together with the import. Bodies to cover: TickerBody, BookBody, TapeBody, CandlesBody, MeTradingBody,
// NewsBody, FilingsBody, BoardBody, PreviewRes, AssetDetail, CandleHistoryRes, IntentResult, ServerFrame.)
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PROTOCOL = existsSync(new URL("../../packages/protocol/package.json", import.meta.url));

describe.skipIf(!PROTOCOL)("CH-06 swap to packages/protocol", () => {
  it("contract types equal the protocol types and recorded frames replay through useChannel", () => {
    // Intentionally failing tripwire: once packages/protocol exists this suite runs, and must be implemented.
    expect.fail("packages/protocol exists: implement the CH-06 swap assertions (see header)");
  });
});
