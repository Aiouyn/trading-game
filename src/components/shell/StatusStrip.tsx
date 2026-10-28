"use client";
import { Chip } from "@/components/ui/Chip";
import { clockLabel } from "@/shell/mockChannels";
import { RANK_NAMES, RANKS } from "@/shell/registry";
import { clockStrings, S } from "@/shell/strings";
import { Glyph } from "./Glyph";
import { MoneyText, PctText } from "./MoneyText";
import { useShell, useShellStore } from "./ShellContext";
import { useNw } from "./useNw";
import { MarketPhase } from "./MarketPhase";
import { HaltChip } from "./SystemOverlays";
import { TickRing } from "./TickRing";


const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export function StatusStrip() {
  const store = useShellStore();
  const clock = useShell((s) => s.channels.clock);
  const rank = useShell((s) => s.channels.rank.rank);
  const sys = useShell((s) => s.channels.system);
  const me = useShell((s) => s.channels.me);
  const nw = useNw();
  const focusMode = useShell((s) => s.local.focusMode);
  const { day, hhmm } = clockLabel(clock);
  const clockText = clockStrings(useShell((s) => s.prefs.locale)).strip(day, hhmm);
  const release = `${S.quay} ${RANKS.indexOf(rank)} · ${RANK_NAMES[rank]}`;
  const halted = useShell((s) => s.channels.system.halted);
  const reconnecting = useShell((s) => s.channels.system.connection === "reconnecting");
  const nwChip = (
    <span className="strip-nw" data-testid="strip-nw">
      <MoneyText amount={nw} ctx="chip" /> <PctText value={me.todayPct} />
    </span>
  );
  if (focusMode) {
    return (
      <header className="strip strip-focus" data-testid="strip">
        <span className="num clock">{clockText}</span>
        <TickRing tick={clock.tick} />
        <HaltChip halted={sys.halted} />
        {nwChip}
      </header>
    );
  }
  return (
    <header className="strip" data-testid="strip">
      <div className="brand">
        <span className="fg"><Glyph name="quay" size={20} /></span>
        <span className="wordmark">{S.quay}</span>
        <span className="num release" data-testid="release">{release}</span>
      </div>
      <button className="launch-field" onClick={() => store.getState().setLauncher(true)}>
        <Glyph name="search" size={14} />
        <span>{S.launcherPlaceholder}</span>
        <kbd>{S.ctrlK}</kbd>
      </button>
      <div className="strip-mid">
        <span className="num clock" data-testid="clock">{clockText}</span>
        <MarketPhase phase={clock.phase} city={S.cityName} halted={halted} reconnecting={reconnecting} />
        <TickRing tick={clock.tick} />
      </div>
      <div className="strip-right">
        <HaltChip halted={sys.halted} />
        {me.protectionEndsRealMs !== null && <Chip data-testid="protection-chip">{`${S.protected} · ${mmss(me.protectionEndsRealMs)}`}</Chip>}
        <Chip tone="acc" data-testid="rank-chip">{`${rank} · ${RANK_NAMES[rank]}`}</Chip>
        {nwChip}
        <button className="icon-btn" aria-label={S.bell}><Glyph name="bell" size={17} /></button>
      </div>
    </header>
  );
}
