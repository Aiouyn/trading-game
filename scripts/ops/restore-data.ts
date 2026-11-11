import { BackupError, planRestore, resolveBackupDir, resolveStoreRoots, restoreDataStore } from "@/server/ops/dataBackup";
import { envFromFlags, parseFlags } from "./flags";

const HELP = `Restore a Port Avalon store snapshot.

Checks every file hash before replacing a live directory. Refuses to write
unless --yes is set. Stop the server first.

Options:
  --data-dir DIR       Live store root to replace (QUAY_DATA_DIR, default .data)
  --backup-dir DIR     Snapshot directory (QUAY_BACKUP_DIR, default .data-backups)
  --auth-dir DIR       Auth dir when the backup stored it outside the data root
  --storm-dir DIR      Storm-world dir when the backup stored it outside the data root
  --telemetry-dir DIR  Telemetry dir when the backup stored it outside the data root
  --id ID              Snapshot to restore (default: newest completed snapshot)
  --dry-run            Print the snapshot id and file count; write nothing
  --yes                Replace the live store
  --help               Show this help

Examples:
  npx tsx scripts/ops/restore-data.ts --dry-run
  npx tsx scripts/ops/restore-data.ts --yes
  npx tsx scripts/ops/restore-data.ts --yes --id 20261111T231501123Z --backup-dir /var/avalon/backups
`;

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(HELP);
    return;
  }
  if (!flags.yes && !flags.dryRun) {
    process.stderr.write(
      "Error: Refusing to replace the live store without --yes.\n  npx tsx scripts/ops/restore-data.ts --dry-run\n  npx tsx scripts/ops/restore-data.ts --yes\n",
    );
    process.exitCode = 2;
    return;
  }
  const env = envFromFlags(flags.values, process.env);
  const opts = {
    roots: resolveStoreRoots(env, process.cwd()),
    backupDir: resolveBackupDir(env, process.cwd()),
    ...(flags.values.id ? { id: flags.values.id } : {}),
  };
  if (flags.dryRun) {
    const plan = await planRestore(opts);
    process.stdout.write(`dry-run: restored-id: ${plan.id}\ndry-run: files: ${plan.files.length}\n`);
    return;
  }
  const result = await restoreDataStore(opts);
  process.stdout.write(`restored-id: ${result.id}\nfiles: ${result.files}\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof BackupError || err instanceof Error ? err.message : "Restore failed.";
  process.stderr.write(`Error: ${message}\n  npx tsx scripts/ops/restore-data.ts --help\n`);
  process.exitCode = 1;
});
