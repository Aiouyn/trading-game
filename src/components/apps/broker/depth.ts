// The Broker's order depth row as a pure selector over the server's depth frame (H8), so the rule is tested without React.
// The client never reads the ecology log: its mirror holds only this viewer's account, so a read there is empty (or wrong).
import type { DepthFrame } from '@/engine';

export interface DepthRow {
  /** the closed game day the row is for */
  day: number;
  depth: number;
  desired: DepthFrame['assets'][string]['desired'];
  /** Fractional return of the last close auction. Absent before that close, and when the engine omitted a flat name. */
  auctionMove?: number;
}

/**
 * The newest closed day's depth for one name, from the server's frame. Null before the first close, for a listing that
 * postdates that close (it has no row yet), and for an unknown name: never a throw.
 */
export function depthRow(frame: DepthFrame | null | undefined, assetId: string): DepthRow | null {
  if (!frame) return null;
  const a = frame.assets[assetId];
  if (!a) return null;
  return {
    day: frame.day,
    depth: a.depth,
    desired: a.desired,
    ...(a.auctionMove !== undefined ? { auctionMove: a.auctionMove } : {}),
  };
}
