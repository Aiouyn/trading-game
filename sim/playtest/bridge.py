# Owns the terminal that play.ts insists on. The driver speaks framed text on stdin/stdout.
import os
import re
import select
import signal
import subprocess
import sys
import time
import fcntl
import termios
import struct

SENTINEL = '<<<PLAYTEST-END>>>'
ANSI = re.compile(r'\x1b\[[0-9;?]*[A-Za-z]')


def emit(status: str, raw: bytes) -> None:
    text = raw.replace(b'\r\n', b'\n').replace(b'\r', b'\n').decode('utf-8', 'replace')
    text = ANSI.sub('', text).replace(SENTINEL, '(end)')
    sys.stdout.write('1\n' if status == 'dead' else '0\n')
    sys.stdout.write(text)
    if text and not text.endswith('\n'):
        sys.stdout.write('\n')
    sys.stdout.write(SENTINEL + '\n')
    sys.stdout.flush()


def read_screen(master: int, proc: subprocess.Popen[bytes], timeout: float) -> tuple[str, bytes]:
    buf = b''
    end = time.time() + timeout
    quiet = None
    while time.time() < end:
        try:
            ready, _, _ = select.select([master], [], [], 0.1)
        except OSError:
            return 'dead', buf
        if ready:
            try:
                chunk = os.read(master, 65536)
            except OSError:
                return 'dead', buf
            if not chunk:
                return 'dead', buf
            buf += chunk
            quiet = time.time()
            continue
        if proc.poll() is not None and (quiet is None or time.time() - quiet >= 0.05):
            return 'dead', buf
        if quiet is None or time.time() - quiet < 0.2:
            continue
        text = buf.decode('utf-8', 'replace')
        if text.rstrip().endswith('>'):
            return 'prompt', buf
        if 'Books balance' in text or 'BOOKS DO NOT BALANCE' in text:
            return 'dead', buf
    return 'dead', buf


def stop(proc: subprocess.Popen[bytes]) -> None:
    if proc.poll() is None:
        proc.kill()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass


def main() -> None:
    if len(sys.argv) < 2:
        sys.stderr.write('usage: bridge.py COMMAND...\n')
        sys.exit(2)
    master, slave = os.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 80, 240, 0, 0))
    proc = subprocess.Popen(sys.argv[1:], stdin=slave, stdout=slave, stderr=slave, close_fds=True)
    os.close(slave)
    signal.signal(signal.SIGTERM, lambda _s, _f: sys.exit(0))
    try:
        status, buf = read_screen(master, proc, 180)
        emit(status, buf)
        if status != 'dead':
            while True:
                line = sys.stdin.readline()
                if line == '':
                    break
                try:
                    os.write(master, line.encode())
                except OSError:
                    emit('dead', b'')
                    break
                status, buf = read_screen(master, proc, 180)
                emit(status, buf)
                if status == 'dead':
                    break
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass
    finally:
        stop(proc)


if __name__ == '__main__':
    main()
