import json
import os
import subprocess
import sys
from pathlib import Path

OPENCODE_CLI = Path(os.environ.get("APPDATA", "")) / "ai.opencode.desktop" / "cli" / "2.0.29-x64" / "opencode-cli.exe"

def list_sessions():
    if not OPENCODE_CLI.exists():
        print(f"Error: OpenCode CLI not found at {OPENCODE_CLI}")
        return []
    res = subprocess.run([str(OPENCODE_CLI), "session", "list"], capture_output=True, text=True, encoding="utf-8")
    lines = [line.strip() for line in res.stdout.strip().splitlines() if line.strip()]
    sessions = []
    for line in lines:
        parts = line.split("\t")
        if len(parts) >= 2:
            sessions.append({
                "id": parts[0].strip(),
                "title": parts[1].strip(),
                "time": parts[2].strip() if len(parts) > 2 else ""
            })
    return sessions

def export_and_import(session_id: str):
    if not OPENCODE_CLI.exists():
        print(f"Error: OpenCode CLI not found at {OPENCODE_CLI}")
        return None
    print(f"Exporting OpenCode session {session_id}...")
    res = subprocess.run([str(OPENCODE_CLI), "session", "export", session_id], capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        print(f"Failed to export: {res.stderr}")
        return None

    try:
        data = json.loads(res.stdout)
    except Exception as e:
        print(f"Failed to parse JSON: {e}")
        return None

    info = data.get("info", {})
    title = info.get("title", session_id)
    cwd = info.get("location", {}).get("directory") or os.getcwd()

    lines = [{"type": "summary", "summary": title}]
    for msg in data.get("messages", []):
        mtype = msg.get("type")
        if mtype == "user":
            text = msg.get("text", "")
            if text:
                lines.append({"type": "user", "cwd": cwd, "sessionId": session_id, "message": {"role": "user", "content": text}})
        elif mtype == "assistant":
            parts = []
            for c in msg.get("content", []):
                if isinstance(c, dict):
                    if c.get("type") == "text" and c.get("text"):
                        parts.append(c["text"])
                    elif c.get("type") == "tool":
                        parts.append(f"[Ran tool: {c.get('name', 'tool')}]")
                elif isinstance(c, str):
                    parts.append(c)
            if parts:
                lines.append({"type": "assistant", "cwd": cwd, "sessionId": session_id, "message": {"role": "assistant", "content": "\n\n".join(parts)}})

    temp_dir = Path(os.environ.get("TEMP", "."))
    temp_file = temp_dir / f"opencode_{session_id}.jsonl"
    with open(temp_file, "w", encoding="utf-8") as f:
        for line in lines:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")

    print(f"Importing into Hermes...")
    import_res = subprocess.run(["hermes", "sessions", "import", "--from", "claude", str(temp_file)], capture_output=True, text=True)
    out = import_res.stdout + import_res.stderr
    print(out.strip())

    # Extract Hermes ID if available:
    hermes_id = None
    for token in out.split():
        if token.startswith("2026"):
            hermes_id = token
            break

    if hermes_id:
        subprocess.run(["hermes", "sessions", "rename", hermes_id, title], capture_output=True)
        print(f"[OK] Renamed in Hermes to: \"{title}\"")
        print(f"-> Resume with: hermes --resume {hermes_id}")

    try:
        temp_file.unlink(missing_ok=True)
    except Exception:
        pass
    return hermes_id

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target = sys.argv[1]
        if target == "--all":
            sessions = list_sessions()
            for s in sessions:
                print(f"\nProcessing: {s['title']} ({s['id']})")
                export_and_import(s["id"])
        else:
            export_and_import(target)
    else:
        sessions = list_sessions()
        print("Available OpenCode Sessions:\n")
        for i, s in enumerate(sessions):
            print(f"[{i+1}] {s['id']}  -  {s['title']}  ({s['time']})")
        print("\nUsage:")
        print("  python scripts/opencode_to_hermes.py <session_id>")
        print("  python scripts/opencode_to_hermes.py --all")
