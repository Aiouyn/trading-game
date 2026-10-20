/** Where a published snapshot lives. The server keeps the 2 prior snapshots (10 §3.26). [P] */
export function snapshotUrl(cityId: string, stateVersion: number): string {
  return `/city/${encodeURIComponent(cityId)}/v${stateVersion}/snapshot.json`;
}
