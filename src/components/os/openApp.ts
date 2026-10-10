'use client';

// Opens an app from a screen, a list row, a notice or a shelf call (P2-142): the phone shows it full screen
// with a back chevron, the desktop opens or focuses its window. One helper, so every app opens the same way
// on both shells (the Wire's story links, the Calendar's rows and the Messages buttons all use it).
import type { AppId, WinProps } from '@/shell/apps';
import { isPhoneViewport, phoneOpen } from './phoneStore';
import { type OpenOpts, openApp } from './shellStore';

export function openFromShell(app: AppId, props: WinProps = {}, opts: OpenOpts = {}): void {
  if (isPhoneViewport()) phoneOpen(app, props);
  else openApp(app, props, opts);
}
