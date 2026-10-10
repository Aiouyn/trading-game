'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import { SANDBOX } from '@/sandbox/config';
import { isoWeekKey } from '@/sandbox/calendar';
import type { BoardEntry } from '@/sandbox/board';
import { planFor, type SandboxSpec } from '@/sandbox/sandbox';
import { SCENARIOS, scenarioById, scenarioNoteVars } from '@/sandbox/scenarios';
import { Button, Card, Tabs } from '@/components/ui';
import { money, signedPct } from '@/game/format';
import { useGame } from '@/game/store';
import { PracticeBanner, PracticeDesk } from './SandboxDesk';
import { sandboxErrorCode, sandboxRpc, type OpenedSandbox } from './sandboxRpc';

/**
 * The Practice tab of the Learn app: a practice account, the six scenario seeds, the weekly challenge (local board) and
 * run files. One run is open at a time, on top of the tabs, and every run is paper money in its own sandbox. A run never
 * reads or writes the live store. The one thing that reaches the server is the weekly challenge's claim: before its run
 * opens, the week's attempt is recorded on the player's record (challenge.claim), so a reload cannot reopen it. The
 * claim changes nothing in the live market or net worth.
 */

type Tab = 'account' | 'scenarios' | 'challenge' | 'files';
type RunKind = 'practice' | 'scenario' | 'challenge' | 'imported';
/** why a gate refused a run: the week's attempt is used, or the record could not be written */
type GateCode = 'used' | 'failed';

interface Run {
  sb: OpenedSandbox;
  kind: RunKind;
  assets: { id: string; assetClass: string }[];
}

const TYPES = ['market', 'limit', 'stop'] as const;

/** The copy for a sandbox error code: the files' codes get their own line, anything else is generic. */
function errorText(e: unknown): string {
  const code = sandboxErrorCode(e);
  return t(`files.error.${code}`) === `files.error.${code}` ? t('practice.error.generic') : t(`files.error.${code}`);
}

export function PracticeView() {
  const [tab, setTab] = useState<Tab>('account');
  const [run, setRun] = useState<Run | null>(null);
  const [complete, setComplete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** bumped when a score is saved, so the local board reloads */
  const [boardRev, setBoardRev] = useState(0);
  const current = useRef<Run | null>(null);

  // the open run is closed when the window goes away, so a worker sandbox never outlives its window
  useEffect(() => () => {
    if (current.current) void sandboxRpc.close(current.current.sb.id);
  }, []);

  /** Make `next` the open run and close the one it replaces. */
  function replaceRun(next: Run | null) {
    const prev = current.current;
    current.current = next;
    setRun(next);
    setComplete(false);
    if (prev && prev.sb.id !== next?.sb.id) void sandboxRpc.close(prev.sb.id);
  }

  /**
   * Open a new run from a spec. Returns null when it opened, or the error code (the reason is in the notice). A gate, when
   * given, runs after the sandbox is made and before it is shown; if it refuses, the run is closed again.
   */
  async function start(spec: SandboxSpec, kind: RunKind, gate?: () => Promise<GateCode | null>): Promise<string | null> {
    setBusy(true);
    try {
      const sb = await sandboxRpc.create(spec);
      if (gate) {
        const refused = await gate();
        if (refused) {
          void sandboxRpc.close(sb.id);
          setNotice(t(refused === 'used' ? 'challenge.used' : 'practice.error.generic'));
          return refused;
        }
      }
      const assets = await sandboxRpc.assets(sb.id);
      replaceRun({ sb, kind, assets });
      setNotice(null);
      return null;
    } catch (e) {
      setNotice(errorText(e));
      return sandboxErrorCode(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="practice-tint flex flex-col gap-3 rounded-lg p-3" data-testid="practice">
      <PracticeBanner />
      <p className="text-caption text-fg-faint">{t('practice.sub')}</p>

      {run ? (
        <Card className="flex flex-col gap-3 p-3" data-testid="practice-run">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-small font-semibold text-fg" data-testid="practice-run-label">{runLabel(run)}</span>
            <Button variant="ghost" size="sm" onClick={() => replaceRun(null)} testId="practice-close-run">{t('practice.closeRun')}</Button>
          </div>
          <PracticeDesk
            key={run.sb.id}
            sb={run.sb}
            prefix={run.kind === 'scenario' ? 'scenario' : run.kind === 'challenge' ? 'challenge' : 'practice'}
            assets={run.assets}
            defaultAsset={run.assets[0]?.id ?? ''}
            types={TYPES}
            defaultQty={10}
            onState={(s) => setComplete(s.view.complete)}
          />
          {run.kind === 'challenge' && complete && (
            <ChallengeSubmit sb={run.sb} onDone={() => { setBoardRev((n) => n + 1); setTab('challenge'); }} />
          )}
        </Card>
      ) : (
        <p className="text-small text-fg-faint" data-testid="practice-none">{t('practice.none')}</p>
      )}

      {notice && <p className="text-small text-loss" role="status" data-testid="practice-alert">{notice}</p>}

      <Tabs
        tabs={[
          { id: 'account', label: t('practice.tab.account') },
          { id: 'scenarios', label: t('practice.tab.scenarios') },
          { id: 'challenge', label: t('practice.tab.challenge') },
          { id: 'files', label: t('practice.tab.files') },
        ]}
        value={tab}
        onChange={setTab}
        className="shrink-0"
      />

      {tab === 'account' && (
        <section className="flex flex-col gap-2" data-testid="practice-account">
          <p className="text-small text-fg-muted">{t('practice.account.sub', { cash: money(SANDBOX.practiceCash) })}</p>
          <Button
            variant="brass"
            onClick={() => start({ kind: 'practice', id: `desk-${Date.now().toString(36)}` }, 'practice')}
            disabled={busy}
            testId="practice-open"
          >
            {run?.kind === 'practice' ? t('practice.new') : t('practice.open')}
          </Button>
        </section>
      )}

      {tab === 'scenarios' && (
        <section className="flex flex-col gap-2" data-testid="practice-scenarios">
          <p className="text-small text-fg-muted">{t('practice.scenarios.sub')}</p>
          <ul className="flex flex-col divide-y divide-ink-2 rounded-lg border border-ink-3 bg-ink-1">
            {SCENARIOS.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`scenario-${s.id}`}>
                <div className="min-w-0">
                  <div className="text-small font-semibold text-fg">{t(s.title)}</div>
                  <div className="text-caption text-fg-muted">{t(s.note, scenarioNoteVars(s))}</div>
                  <div className="text-caption text-fg-faint">{t('practice.scenario.days', { n: s.days })}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => start({ kind: 'scenario', scenarioId: s.id }, 'scenario')} disabled={busy} testId={`practice-scenario-${s.id}`}>
                  {t('practice.scenario.play')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'challenge' && <ChallengeTab busy={busy} start={start} boardRev={boardRev} />}

      {tab === 'files' && <FilesTab run={run} onImported={(next) => replaceRun(next)} setNotice={setNotice} />}
    </div>
  );
}

function runLabel(run: Run): string {
  if (run.kind === 'scenario' && run.sb.plan.scenarioId) {
    const s = scenarioById(run.sb.plan.scenarioId);
    return s ? t(s.title) : t('practice.run.scenario');
  }
  if (run.kind === 'challenge') return t('practice.run.challenge');
  if (run.kind === 'imported') return t('files.run.imported');
  return t('practice.run.practice');
}

/** The weekly challenge: one scored attempt per ISO week, on a local board (board.ts). */
function ChallengeTab({ busy, start, boardRev }: { busy: boolean; start: (spec: SandboxSpec, kind: RunKind, gate?: () => Promise<GateCode | null>) => Promise<string | null>; boardRev: number }) {
  const act = useGame((s) => s.act);
  const claimedWeeks = useGame((s) => s.me?.trading.challengeWeeks);
  const [weekKey] = useState(() => isoWeekKey(new Date()));
  // the attempt is on the player's record, so it is used from the record: a reload or a new tab cannot reopen it. The
  // local flag only covers a run opened in this view before the record is read back.
  const [openedHere, setOpenedHere] = useState(false);
  const used = openedHere || !!claimedWeeks?.includes(weekKey);
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const plan = planFor({ kind: 'challenge', weekKey });
  const scenario = plan.scenarioId ? scenarioById(plan.scenarioId) : undefined;

  // the board is read on open and again whenever a score is saved (boardRev)
  useEffect(() => {
    let live = true;
    sandboxRpc.leaderboard(weekKey).then((rows) => { if (live) setBoard(rows); }).catch(() => undefined);
    return () => { live = false; };
  }, [weekKey, boardRev]);

  async function open() {
    // the week's attempt is recorded on the player's record before the run is shown; the sandbox's own claim (board.ts)
    // stops a second run in this page too
    const code = await start({ kind: 'challenge', weekKey }, 'challenge', async () => {
      const ack = await act({ type: 'challenge.claim', weekKey }, { silent: true });
      if (ack.ok) return null;
      return /already/.test(ack.error ?? '') ? 'used' : 'failed';
    });
    if (code === null || code === 'already-attempted' || code === 'used') setOpenedHere(true);
  }

  return (
    <section className="flex flex-col gap-2" data-testid="challenge">
      <p className="text-small text-fg" data-testid="challenge-week">{t('challenge.week', { week: weekKey })}</p>
      <p className="text-small text-fg-muted" data-testid="challenge-scenario">
        {t('challenge.scenario', { title: scenario ? t(scenario.title) : '' })}
      </p>
      <p className="text-caption text-fg-faint">{t('challenge.sub')}</p>
      <Button variant="brass" onClick={open} disabled={busy || used} testId="challenge-start">{t('challenge.start')}</Button>
      {used && <p className="text-small text-warn" data-testid="challenge-used">{t('challenge.used')}</p>}

      <h3 className="label text-fg-faint pt-2">{t('challenge.board')}</h3>
      {board.length === 0 && <p className="text-small text-fg-faint" data-testid="challenge-board-empty">{t('challenge.board.empty')}</p>}
      <ol className="flex flex-col" data-testid="challenge-board">
        {board.map((row, i) => (
          <li key={row.seq} className="flex items-center justify-between gap-2 border-t border-ink-2 py-2 text-small" data-testid={`challenge-row-${i + 1}`}>
            <span className="num text-fg-muted">#{i + 1}</span>
            <span className="num">{money(row.equity)}</span>
            <span className="num text-fg-muted">{signedPct(row.returnPct)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Saves the finished challenge run's score to the local board. */
function ChallengeSubmit({ sb, onDone }: { sb: OpenedSandbox; onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'saved' | 'failed'>('idle');
  async function submit() {
    try {
      await sandboxRpc.submit(sb.id);
      setState('saved');
      onDone();
    } catch {
      setState('failed');
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <Button variant="brass" onClick={submit} disabled={state === 'saved'} testId="challenge-submit">{t('challenge.submit')}</Button>
      {state === 'saved' && <p className="text-small text-gain" role="status" data-testid="challenge-saved">{t('challenge.saved')}</p>}
      {state === 'failed' && <p className="text-small text-loss" role="status">{t('practice.error.generic')}</p>}
    </div>
  );
}

/** Run files: export the open run as a file, or open one. Both only happen on a click. Imported runs are never ranked. */
function FilesTab({ run, onImported, setNotice }: { run: Run | null; onImported: (next: Run) => void; setNotice: (s: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);

  async function exportRun() {
    if (!run) return;
    try {
      const { text } = await sandboxRpc.exportRun(run.sb.id);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `practice-run-${run.sb.plan.kind}-${run.sb.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(t('files.exported'));
    } catch (e) {
      setNotice(errorText(e));
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > SANDBOX.maxRunBytes) {
      setNotice(t('files.error.run-too-large'));
      return;
    }
    try {
      const text = await file.text();
      const sb = await sandboxRpc.importRun(text);
      const assets = await sandboxRpc.assets(sb.id);
      onImported({ sb, kind: 'imported', assets });
      setNotice(t('files.imported'));
    } catch (e) {
      setNotice(errorText(e));
    }
  }

  return (
    <section className="flex flex-col gap-3" data-testid="practice-files">
      <p className="text-small text-fg-muted">{t('files.sub')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={exportRun} disabled={!run} testId="run-export">{t('files.export')}</Button>
        <Button variant="outline" onClick={() => input.current?.click()} testId="run-import-open">{t('files.import')}</Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label={t('files.import')}
          data-testid="run-import"
          onChange={(e) => {
            void importFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {!run && <p className="text-caption text-fg-faint" data-testid="files-none">{t('files.none')}</p>}
    </section>
  );
}
