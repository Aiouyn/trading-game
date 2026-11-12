import { assertNoRepoData } from "./unit/ci/no-repo-data";

/** Runs in the vitest main process after every worker finishes. */
export default function setup(): () => void {
  return () => {
    assertNoRepoData(process.cwd());
  };
}
