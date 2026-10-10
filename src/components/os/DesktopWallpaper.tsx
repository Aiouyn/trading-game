// Desktop wallpaper for one palette (P2-232). Named DesktopWallpaper, not Wallpaper, because wallpaper.ts is the data module and the two names differ only by case (a Windows import would pick the wrong file).
// The SVG comes from wallpaperSvg(), which is numeric
// except for the static caption, so inserting it with dangerouslySetInnerHTML carries no user input.
// Fonts are the next/font CSS variables, so SVG text follows the app's font setup.
// idPrefix is sanitised here (useId() output contains colons, which are not valid in url(#...) refs),
// so pass it straight from useId() when more than one wallpaper is in a document.
import { type ArtSlug, wallpaperSvg } from './wallpaper';

export interface WallpaperProps {
  slug: ArtSlug;
  /** Fixed design size; the SVG uses xMidYMid slice so it fills any viewport. */
  width?: 1440 | 390 | number;
  height?: 900 | 844 | number;
  /** Horizon fraction of height. The mocks use 0.79. */
  hzf?: number;
  idPrefix?: string;
}

/** Keeps only the characters that are safe in an SVG id and a url(#...) reference. */
export function safeIdPrefix(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, '');
}

export function Wallpaper({ slug, width = 1440, height = 900, hzf = 0.79, idPrefix = '' }: WallpaperProps) {
  const svg = wallpaperSvg({ slug, w: width, h: height, hzf, idPrefix: safeIdPrefix(idPrefix), fonts: 'css-vars' });
  return <div className="os-wallpaper" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}
