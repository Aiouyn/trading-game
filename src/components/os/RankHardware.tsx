// Rank hardware frames (P2-193..P2-199). Presentational only: the look is in src/styles/os.css,
// keyed on the .shell-rN class that OsRoot puts on <html>. Renders nothing that takes input.
import { t } from '@/i18n';
import { hardwareParts, type Rank, testIdFor } from './hardware';

export function RankHardware({ rank }: { rank: Rank }) {
  return (
    <div className="os-hardware" aria-hidden="true">
      {hardwareParts(rank).map(({ part }) => {
        switch (part) {
          case 'bezel':
            return <div key={part} className={`os-bezel os-bezel-r${rank}`} data-testid={testIdFor(part)} />;
          case 'crack':
            // 1 px hairline across the top-right corner, fg-disabled at 50% (P2-193). Never over controls.
            return (
              <svg
                key={part}
                className="os-crack"
                data-testid={testIdFor(part)}
                viewBox="0 0 120 120"
                preserveAspectRatio="none"
              >
                <path d="M120 0 L104 18 L110 30 L92 46 L98 62 L86 74" />
              </svg>
            );
          case 'sticker':
            return (
              <div key={part} className="os-hw os-hw-sticker" data-testid={testIdFor(part)}>
                {t('os.hw.sticker')}
              </div>
            );
          default:
            return <div key={part} className={`os-hw os-hw-${part}`} data-testid={testIdFor(part)} />;
        }
      })}
    </div>
  );
}
