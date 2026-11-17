"use client";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { clockLabel } from "@/shell/mockChannels";
import { isAuthPending, isSignedIn, openAccountSettings, useAuthChrome } from "@/shell/authChrome";
import { RANK_NAMES, RANKS } from "@/shell/registry";
import { clockStrings, S } from "@/shell/strings";
import { Glyph } from "./Glyph";
import { MoneyText, PctText } from "./MoneyText";
import { useShell, useShellStore } from "./ShellContext";
import { nwStateLabel, useNwReading } from "./useNw";
import { MarketPhase } from "./MarketPhase";
import { HaltChip } from "./SystemOverlays";
import { HOME_EXAMPLE } from "./homeExample";
import { TickRing } from "./TickRing";
import { FeedbackButton } from "./FeedbackButton";
import { TimeControls } from "@/shell/TimeControls";
import { toggleNotes } from "./flowState";

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export function StatusStrip() {
  const store = useShellStore();
  const clock = useShell((s) => s.channels.clock);
  const rank = useShell((s) => s.channels.rank.rank);
  const sys = useShell((s) => s.channels.system);
  const me = useShell((s) => s.channels.me);
  const nw = useNwReading();
  const auth = useAuthChrome();
  const signedIn = isSignedIn(auth);
  const pending = isAuthPending(auth);
  const focusMode = useShell((s) => s.local.focusMode);
  const locale = useShell((s) => s.prefs.locale);
  const sim = me.source === "sim";
  const simDate = clock.sim;
  const { day, hhmm } = clockLabel(clock);
  const clockText = simDate ? `Y${simDate.year} M${simDate.month} D${simDate.day}` : clockStrings(locale).strip(day, hhmm);
  const release = sim
    ? `${S.quay} ${RANKS.indexOf(rank)} · ${RANK_NAMES[rank]}`
    : signedIn
      ? `${S.quay} · ${auth.account.handle}`
      : pending
        ? null
        : `${S.quay} ${RANKS.indexOf(rank)} · ${RANK_NAMES[rank]}`;
  const halted = useShell((s) => s.channels.system.halted);
  const reconnecting = useShell((s) => s.channels.system.connection === "reconnecting");
  const offline = useShell((s) => s.channels.system.offline);
  const nwChip = (
    <span className="strip-nw" data-testid="strip-nw" data-nw-state={nw.state} title={nw.nw === null ? nwStateLabel(nw.state) : signedIn ? S.demoBalance : undefined}>
      {nw.nw === null ? <span className="num muted" aria-hidden="true">{S.nwUnknown}</span> : <MoneyText amount={nw.nw} ctx="chip" />}
      {nw.nw === null ? (
        // NW not known yet (session loading / ledger unavailable): say which, never a number. Card 29: no Demo balance tag.
        <span className="muted strip-demo-tag" data-testid="strip-nw-state"><span aria-hidden="true">{" · "}</span>{nwStateLabel(nw.state)}</span>
      ) : sim ? (
        <> <span className="muted">Today</span> <MoneyText amount={me.todayChg} ctx="delta" /> <PctText value={me.todayPct} /></>
      ) : signedIn ? (
        // Signed-in: the server-saved NW is labelled as such (M1-08) and today's % shows too (card 29); never "Demo balance".
        <><span className="muted strip-demo-tag" data-testid="strip-nw-label"><span aria-hidden="true">{" · "}</span>{S.demoBalance}</span> <PctText value={me.todayPct} /></>
      ) : (
        <> <PctText value={me.todayPct} /></>
      )}
    </span>
  );

  if (focusMode) {
    return (
      <header className="strip strip-focus" data-testid="strip">
        <span className="num clock" data-tick={clock.tick}>{clockText}</span>
        {sim ? <TimeControls /> : <TickRing tick={clock.tick} />}
        <HaltChip halted={sys.halted} />
        {nwChip}
        {sim ? <button className="icon-btn" aria-label={S.bell} data-testid="notes-bell" onClick={() => toggleNotes()}><Glyph name="bell" size={17} /></button> : null}
      </header>
    );
  }
  return (
    <header className="strip" data-testid="strip">
      <div className="brand">
        <span className="fg"><Glyph name="quay" size={20} /></span>
        <span className="wordmark">{S.quay}</span>
        <span className="num release" data-testid="release">{!sim && pending ? <span className="auth-skel-release" data-testid="auth-skel-release" aria-hidden="true" /> : release}</span>
      </div>
      <button className="launch-field" onClick={() => store.getState().setLauncher(true)}>
        <Glyph name="search" size={14} />
        <span>{S.launcherPlaceholder}</span>
        <kbd>{S.ctrlK}</kbd>
      </button>
      <div className="strip-mid">
        <span className="num clock" data-testid="clock" data-tick={clock.tick}>{clockText}</span>
        {sim ? <TimeControls /> : (
          <>
            <MarketPhase phase={clock.phase} city={S.cityName} halted={halted} reconnecting={reconnecting} offline={offline} />
            <TickRing tick={clock.tick} />
          </>
        )}
      </div>
      <div className="strip-right">
        <HaltChip halted={sys.halted} />
        {me.protectionEndsRealMs !== null && <Chip data-testid="protection-chip">{`${S.protected} · ${mmss(me.protectionEndsRealMs)}`}</Chip>}
        {sim ? (
          <Chip tone="acc" data-testid="rank-chip">{`${rank} · ${RANK_NAMES[rank]}`}</Chip>
        ) : pending ? (
          <span className="auth-skel-chrome" data-testid="auth-skel-chrome" aria-hidden="true" />
        ) : signedIn ? (
          <button
            type="button"
            className="chip chip-acc strip-account"
            data-testid="account-chip"
            aria-label={`${S.account}: ${auth.account.handle}`}
            onClick={() => openAccountSettings(store)}
          >
            {auth.account.handle}
          </button>
        ) : (
          <>
            <Chip tone="acc" data-testid="rank-chip">{`${rank} · ${RANK_NAMES[rank]}`}</Chip>
            <Button
              variant="secondary"
              size="sm"
              data-testid="sign-in-entry"
              aria-label={S.signIn}
              onClick={() => openAccountSettings(store)}
            >
              {S.signIn}
            </Button>
          </>
        )}
        {nwChip}
        {!sim && auth.status === "signed_out" ? (
          <span className="muted" data-testid="strip-demo-tag">{HOME_EXAMPLE.en.tag}</span>
        ) : null}
        {!sim && <FeedbackButton />}
        <button className="icon-btn" aria-label={S.bell} data-testid="notes-bell" onClick={sim ? () => toggleNotes() : undefined}><Glyph name="bell" size={17} /></button>
      </div>
    </header>
  );
}
