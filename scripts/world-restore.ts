// npm run world:restore -- <backup file> [--data <folder>]: see server/restore.ts (runRestore) and docs/PLAY.md.
import { runRestore } from '../server/restore';

process.exitCode = runRestore(process.argv.slice(2));
