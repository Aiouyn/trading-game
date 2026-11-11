const VALUE_FLAGS = new Set(["data-dir", "backup-dir", "auth-dir", "storm-dir", "telemetry-dir", "keep", "id"]);

export interface CliFlags {
  readonly help: boolean;
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly values: Readonly<Record<string, string>>;
}

export function parseFlags(argv: readonly string[]): CliFlags {
  const values: Record<string, string> = {};
  let help = false;
  let yes = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") help = true;
    else if (a === "--yes") yes = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--")) {
      const name = a.slice(2);
      if (!VALUE_FLAGS.has(name)) throw new Error(`Unknown flag --${name}.`);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--")) throw new Error(`Missing value for --${name}.`);
      values[name] = val;
      i += 1;
    } else throw new Error(`Unexpected argument ${a}.`);
  }
  return { help, yes, dryRun, values };
}

const FLAG_ENV: Readonly<Record<string, string>> = {
  "data-dir": "QUAY_DATA_DIR",
  "backup-dir": "QUAY_BACKUP_DIR",
  "auth-dir": "QUAY_AUTH_DATA_DIR",
  "storm-dir": "QUAY_STORM_DATA_DIR",
  "telemetry-dir": "QUAY_TELEMETRY_DIR",
  keep: "QUAY_BACKUP_KEEP",
};

export function envFromFlags(values: Readonly<Record<string, string>>, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const [flag, key] of Object.entries(FLAG_ENV)) {
    const v = values[flag];
    if (v !== undefined) env[key] = v;
  }
  return env;
}
