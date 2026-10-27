"""Parse the spec files into addressable sections. Section address: '<file>§<num>' e.g. '05§3.5.2'."""
import re, os, glob
_REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'vision-review', 'complete'))
SPEC = next((p for p in (os.environ.get('AVALON_SPEC_DIR'), _REPO, '/mnt/project-files/vision-review/complete') if p and os.path.isdir(p)), _REPO)
HEAD = re.compile(r'^(#{1,6})\s+§?(\d+(?:\.\d+)*)\.?\s+(.*)$')

def files():
    out = {}
    for p in sorted(glob.glob(SPEC + '/[0-2][0-9]-*.md')):
        out[os.path.basename(p)[:2]] = p
    return out

_cache = {}
def sections(mod):
    """Return ordered list of (num, level, title, start_line, end_line_exclusive, text_including_subsections)."""
    if mod in _cache: return _cache[mod]
    lines = open(files()[mod], encoding='utf-8').read().split('\n')
    heads = []
    in_code = False
    for i, l in enumerate(lines):
        if l.startswith('```'): in_code = not in_code
        if in_code: continue
        m = HEAD.match(l)
        if m: heads.append((m.group(2), len(m.group(1)), m.group(3).strip(), i))
    res = []
    for k, (num, lvl, title, st) in enumerate(heads):
        end = len(lines)
        for num2, lvl2, t2, st2 in heads[k+1:]:
            if lvl2 <= lvl: end = st2; break
        res.append((num, lvl, title, st, end, '\n'.join(lines[st:end]).rstrip() + '\n'))
    _cache[mod] = res
    return res

def get(mod, num):
    for s in sections(mod):
        if s[0] == num: return s
    raise KeyError(f'{mod}§{num}')

def text(mod, num):
    return get(mod, num)[5]

def tok(s):
    return len(s) // 4  # rough token estimate (4 chars/token)

AT_PATTERNS = [re.compile(r'^\s*(\d+)\.\s+(.*)'), re.compile(r'^\s*\*\*?(?:\d\d-)?(?:AT-?|T|AT )?(\d+)\*?\*?[.:)]?\s+(.*)'),
               re.compile(r'^\s*(?:\d\d-)?AT-?0*(\d+)\b[.:)]?\s*(.*)'), re.compile(r'^\s*[-|]?\s*\**T0*(\d+)\**\s*[|.:]\s*(.*)')]
def acceptance_tests(mod):
    """Return dict testno(int) -> text, from the module's §10 (and sub-sections)."""
    secs = [x for x in sections(mod) if x[1] == 2 and 'cceptance tests' in x[2]]
    if not secs: return {}
    body = secs[0][5]
    out = {}
    cur = None
    for line in body.split('\n')[1:]:
        if line.startswith('#'): cur=None; continue
        m = None
        for p in AT_PATTERNS:
            m = p.match(line)
            if m: break
        if m:
            n = int(m.group(1)); cur = n
            out[n] = (out.get(n, '') + '\n' + line).strip() if n in out else line.strip()
        elif cur is not None and line.strip() and (line.startswith('   ') or line.startswith('\t')):
            out[cur] += '\n' + line
    return out

def at_section(mod):
    secs = [x for x in sections(mod) if x[1] == 2 and 'cceptance tests' in x[2]]
    return secs[0][0] if secs else None
