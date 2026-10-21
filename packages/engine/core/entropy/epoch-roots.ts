import { sha256, sha256Concat } from '../crypto/sha256';
import { toHex, u32be } from '../crypto/hex';

import type { EpochRoots } from '../rng/manager';   // T02-06 owns EpochRoots (was a local port here)

export class EpochRootStore implements EpochRoots {
  private readonly secretRoot: Uint8Array; private readonly publicRootFor: (chapter: number) => Uint8Array;
  constructor(o: { secretRoot: Uint8Array; publicRootFor: (chapter: number) => Uint8Array }) { this.secretRoot = o.secretRoot; this.publicRootFor = o.publicRootFor; }
  publicRoot(epoch: number): Uint8Array { return this.publicRootFor(epoch); }
  /** SHA-256('TYC/secret-epoch' ‖ secretRoot ‖ k). SPEC GAP: k encoding not given; u32be assumed. */
  secretEpochRoot(epoch: number): Uint8Array { return sha256Concat('TYC/secret-epoch', this.secretRoot, u32be(epoch)); }
  publicRootCommit(epoch: number): string { return toHex(sha256(this.publicRoot(epoch))); }
  revealablePublicRoot(currentEpoch: number): { epoch: number; root: string } | undefined {
    const e = currentEpoch - 2; return e < 0 ? undefined : { epoch: e, root: toHex(this.publicRoot(e)) };
  }
}

export function harnessEpochRoots(localSeed: Uint8Array): EpochRootStore {
  return new EpochRootStore({
    secretRoot: sha256Concat('TYC/harness-secret', localSeed),
    publicRootFor: (k) => sha256Concat('TYC/harness-public', localSeed, u32be(k)),
  });
}
