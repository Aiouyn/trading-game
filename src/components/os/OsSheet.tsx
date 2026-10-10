'use client';

// A sheet for the desktop's own prompts (the While You Were Away digest, the first-session coach). It is
// not a page overlay: there is no scrim, so the strip, the shelf and the windows stay in view and usable
// (P2-069). On the phone it is a bottom sheet (V:143, V:155). Escape closes it while focus is inside it.
// Its class is os-prompt: os-sheet is the phone's Recent sheet, and os-phone.css loads it on every viewport.
import { type ReactNode, useEffect, useRef } from 'react';
import { t } from '@/i18n';

export function OsSheet({
  title,
  testId,
  onClose,
  children,
}: {
  title: string;
  testId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.key !== 'Escape') return;
      if (ref.current?.contains(document.activeElement) !== true) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <section
      ref={ref}
      role="dialog"
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
      className="os-prompt"
    >
      <div className="os-sheet-head">
        <h2 id={`${testId}-title`} className="font-serif text-title text-fg">{title}</h2>
        <button type="button" className="os-sheet-x" aria-label={t('common.close')} onClick={onClose}>
          <span aria-hidden>✕</span>
        </button>
      </div>
      {children}
    </section>
  );
}
