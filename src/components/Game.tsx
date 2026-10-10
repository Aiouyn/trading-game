'use client';

import { useEffect } from 'react';
import { useGame } from '@/game/store';
import { ChatDrawer, InboxDrawer } from './Shell';
import { Coach, ConnectionBanner, DigestModal } from './Overlays';
import { ProfileModal } from './Social';
import { OsRoot } from './os/OsRoot';
import { OsUpdate } from './os/OsUpdate';
import { Loading, Welcome } from './Welcome';

function useBoot() {
  const status = useGame((s) => s.status);
  useEffect(() => { useGame.getState().boot(); }, []);
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

  if (status === 'welcome') return <Welcome />;
  if (!hasMe) return <Loading />;

  return (
    <>
      <OsRoot />
      <OsUpdate />
      <DigestModal />
      <InboxDrawer />
      <ChatDrawer />
      <ProfileModal />
      <ConnectionBanner />
      <Coach />
    </>
  );
}
