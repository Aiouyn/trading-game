'use client';

import { useEffect } from 'react';
import { useGame } from '@/game/store';
import { initLocale, useLocale } from '@/i18n';
import { CloseCard } from './CloseCard';
import { ComebackHost } from './comeback/ComebackScreens';
import { Coach, ConnectionBanner, DigestModal } from './Overlays';
import { ProfileModal } from './Social';
import { OsRoot } from './os/OsRoot';
import { OsUpdate } from './os/OsUpdate';
import { Loading, Welcome } from './Welcome';

function useBoot() {
  const status = useGame((s) => s.status);
  useEffect(() => {
    // The saved language (tg-prefs) is read once on the client, before the save loads.
    initLocale();
    useGame.getState().boot();
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.game = status === 'ready' ? 'ready' : status;
  }, [status]);
  return status;
}

/**
 * The shell for every viewport. OsRoot draws the desktop OS at 768 px and up, and the phone desktop (home,
 * full-screen apps, Recent) below that. Both bind the same save and earned rank (P2-135).
 */
export function Game() {
  const status = useBoot();
  const hasMe = useGame((s) => !!s.me && !!s.world);
  // t() is not reactive: subscribing here re-renders the whole tree when the language changes (Settings).
  useLocale((s) => s.locale);

  if (status === 'welcome') return <Welcome />;
  if (!hasMe) return <Loading />;

  return (
    <>
      <OsRoot />
      <OsUpdate />
      <DigestModal />
      <ComebackHost />
      <CloseCard />
      <ProfileModal />
      <ConnectionBanner />
      <Coach />
    </>
  );
}
