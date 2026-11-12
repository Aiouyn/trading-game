import { BACKUP_KEEP_DEFAULT, BackupError, backupDataStore, resolveBackupDir, resolveStoreRoots } from "@/server/ops/dataBackup";
import { envFromFlags, parseFlags } from "./flags";

const HELP = `Backup the Port Avalon on-disk store.

Copies auth, market, and telemetry files into a new snapshot directory, then
renames that directory into place. Older snapshots beyond --keep are removed.
Does not modify the live store. Stop the server first so auth and world files
are from the same moment.

Options:
  --data-dir DIR       Live store root (QUAY_DATA_DIR, default .data)
  --backup-dir DIR     Snapshot directory (QUAY_BACKUP_DIR, default .data-backups)
  --auth-dir DIR       Auth dir when it sits outside the data root (QUAY_AUTH_DATA_DIR)
  --storm-dir DIR      Storm-world dir when it sits outside the data root (QUAY_STORM_DATA_DIR)
  --telemetry-dir DIR  Telemetry dir when it sits outside the data root (QUAY_TELEMETRY_DIR)
  --keep N             Snapshots to retain (QUAY_BACKUP_KEEP, default ${BACKUP_KEEP_DEFAULT})
  --dry-run            Print the snapshot id and file count; write nothing
  --help               Show this help

Examples:
  npx tsx scripts/ops/backup-data.ts
  npx tsx scripts/ops/backup-data.ts --dry-run
  npx tsx scripts/ops/backup-data.ts --data-dir /var/avalon/data --backup-dir /var/avalon/backups --keep 7
`;

function keepOf(env: NodeJS.ProcessEnv): number {
  const raw = env.QUAY_BACKUP_KEEP?.trim() || String(BACKUP_KEEP_DEFAULT);
  if (!/^\d+$/.test(raw)) {
    throw new BackupError("QUAY_BACKUP_KEEP must be a positive integer. Example: npx tsx scripts/ops/backup-data.ts --keep 7");
  }
  return Number(raw);
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(HELP);
    return;
  }
  const env = envFromFlags(flags.values, process.env);
  const plan = await backupDataStore({
    roots: resolveStoreRoots(env, process.cwd()),
    backupDir: resolveBackupDir(env, process.cwd()),
    keep: keepOf(env),
    dryRun: flags.dryRun,
  });
  const prefix = flags.dryRun ? "dry-run: " : "";
  process.stdout.write(`${prefix}backup-id: ${plan.id}\n${prefix}backup-dir: ${plan.dir}\n${prefix}files: ${plan.files.length}\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Backup failed.";
  process.stderr.write(`Error: ${message}\n  npx tsx scripts/ops/backup-data.ts --help\n`);
  process.exitCode = 1;
});
