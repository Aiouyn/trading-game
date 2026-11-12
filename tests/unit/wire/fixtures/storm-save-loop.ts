// Child process for the crash-mid-write unit: saves two different complete snapshots (A, B) to one FileStormWorldStore
// in a tight loop until it is SIGKILLed. Each `wire` carries `rows` items whose ids all end in the snapshot's tag, so a
// reader can tell a complete A, a complete B, or a mix. Usage: tsx storm-save-loop.ts <file> <rows>
import { FileStormWorldStore } from "../../../../src/server/market/stormWorldStore";
import { emptyStormWorld } from "../../../../src/server/market/storms";

const [file, rowsArg] = process.argv.slice(2);
const rows = Number(rowsArg ?? 400);
const snap = (tag: "A" | "B", tick: number) => ({
  ...emptyStormWorld(),
  lastTick: tick,
  wire: {
    v: 1,
    items: Array.from({ length: rows }, (_, i) => ({
      id: `w-${27700 + i}-${tag}`, kind: "NEWS", headlineKey: "wire.news.contractWin", slots: { pad: "x".repeat(200) },
      entities: [{ id: "AVB", kind: "asset", label: "AVB" }], tick: 27700 + i, breaking: false, causeEventIds: [`c-${i}-${tag}`],
    })),
  },
});
const store = new FileStormWorldStore(file!);
const a = snap("A", 30000), b = snap("B", 30001);
process.stdout.write("ready\n");
for (let n = 0; ; n++) store.save((n % 2 ? b : a) as never);
