"use client";
import { clockLabel } from "@/shell/mockChannels";
import { RANK_NAMES, RANKS } from "@/shell/registry";
import { S } from "@/shell/strings";
import { Glyph } from "./Glyph";
import { MoneyText, PctText } from "./MoneyText";
import { useShell, useShellStore } from "./ShellContext";
import { TickRing } from "./TickRing";

const PHASE_LABEL = { pre: "Pre-market", open_auction: "Opening auction", continuous: "Market open", close_auction: "Closing auction", after: "After hours", weekend: "Weekend" } as const;

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export function StatusStrip() {
  const store = useShellStore();
  const clock = useShell((s) => s.channels.clock);
  const rank = useShell((s) => s.channels.rank.rank);
  const me = useShell((s) => s.channels.me);
  const focusMode = useShell((s) => s.local.focusMode);
  const { day, hhmm } = clockLabel(clock);
  const release = `${S.quay} ${RANKS.indexOf(rank)} · ${RANK_NAMES[rank]}`;
  const open = clock.phase === "continuous";
  const nw = (
    <span className="strip-nw" data-testid="strip-nw">
      <MoneyText value={me.nw} /> <PctText value={me.todayPct} />
    </span>
  );
  if (focusMode) {
    return (
      <header className="strip strip-focus" data-testid="strip">
        <span className="num clock">{`Day ${day} · ${hhmm}`}</span>
        <TickRing tick={clock.tick} />
        {nw}
      </header>
    );
  }
  return (
    <header className="strip" data-testid="strip">
      <div className="brand">
        <span className="acc"><Glyph name="quay" size={20} /></span>
        <span className="wordmark">{S.quay}</span>
        <span className="num release" data-testid="release">{release}</span>
      </div>
      <button className="launch-field" onClick={() => store.getState().setLauncher(true)}>
        <Glyph name="search" size={14} />
        <span>{S.launcherPlaceholder}</span>
        <kbd>{S.ctrlK}</kbd>
      </button>
      <div className="strip-mid">
        <span className="num clock" data-testid="clock">{`Day ${day} · ${hhmm}`}</span>
        <span className="phase" data-testid="phase">
          <span className={`dot ${open ? "dot-gain" : "dot-faint"}`} />
          {`${PHASE_LABEL[clock.phase]} · Port Avalon`}
        </span>
        <TickRing tick={clock.tick} />
      </div>
      <div className="strip-right">
        {me.protectionEndsRealMs !== null && <span className="chip">{`${S.protected} · ${mmss(me.protectionEndsRealMs)}`}</span>}
        <span className="chip chip-acc" data-testid="rank-chip">{`${rank} · ${RANK_NAMES[rank]}`}</span>
        {nw}
        <button className="icon-btn" aria-label={S.bell}><Glyph name="bell" size={17} /></button>
      </div>
    </header>
  );
}
