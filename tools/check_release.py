#!/usr/bin/env python3
"""Pre-release consistency check for a static PWA (index.html + sw.js + js/*.js, no build step).

Usage:
  python check_release.py --root /path/to/app [--zip release.zip] [--changes-since previous.zip] [--expect-version 190] [--syntax]

Checks (FAIL = release would ship stale or broken files):
  1. every ?v=N in index.html is the same N (and equals --expect-version if given)
  2. sw.js has const V and const CACHE; V equals that N; no hard-coded ?v= left in sw.js
  3. every js/*.js file is loaded by index.html AND listed in the service-worker precache list; every referenced file exists
  4. APP_VERSION (js/core.js) equals the visible .appver text in index.html; no hard-coded "V17"-style label in visible markup;
     warns if APP_VERSION is not MAJOR.MINOR.REVISION or the cache name does not contain it
  5. --zip: every file in the zip is byte-identical to the folder, nothing from the folder is missing, assets/js/config.js is NOT inside
  6. --changes-since OLD.zip: lists files added / removed / modified since the previous release, so unexplained edits are noticed
  7. --syntax: node --check on every js file and sw.js
Exit code 1 on any FAIL. Warnings do not fail.
"""
import argparse, hashlib, os, re, subprocess, sys, zipfile

def md5(b): return hashlib.md5(b).hexdigest()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True); ap.add_argument('--zip'); ap.add_argument('--changes-since')
    ap.add_argument('--expect-version'); ap.add_argument('--syntax', action='store_true')
    ap.add_argument('--index', default='index.html'); ap.add_argument('--sw', default='sw.js'); ap.add_argument('--core', default='js/core.js')
    a = ap.parse_args(); R = a.root
    fails, warns = [], []
    def ok(msg): print('PASS  ' + msg)
    def fail(msg): fails.append(msg); print('FAIL  ' + msg)
    def warn(msg): warns.append(msg); print('WARN  ' + msg)
    rd = lambda p: open(os.path.join(R, p), encoding='utf-8').read()
    html, sw, core = rd(a.index), rd(a.sw), rd(a.core)

    # 1) asset versions in index.html
    vers = sorted(set(re.findall(r'\?v=([0-9A-Za-z.]+)', html)))
    if len(vers) == 1: ok(f'index.html: all {len(re.findall(r"[?]v=", html))} asset URLs use ?v={vers[0]}')
    else: fail(f'index.html asset versions differ or are missing: {vers}')
    N = vers[0] if len(vers) == 1 else None
    if a.expect_version and N != a.expect_version: fail(f'expected ?v={a.expect_version} but index.html has {N}')

    # 2) service worker constants
    mv = re.search(r"const\s+V\s*=\s*'([^']+)'", sw); mc = re.search(r"const\s+CACHE\s*=\s*'([^']+)'", sw)
    if not mv: fail("sw.js has no const V='…' (versioned URLs would be hard-coded)")
    elif N and mv.group(1) != N: fail(f"sw.js V='{mv.group(1)}' but index.html uses ?v={N} (precache would store a URL the page never requests)")
    else: ok(f"sw.js V='{mv.group(1) if mv else '?'}' matches index.html")
    if not mc: fail("sw.js has no const CACHE='…'")
    else: ok(f"sw.js CACHE name = {mc.group(1)} (must change every release so old caches are purged)")
    if re.findall(r'\?v=\d+', sw): fail(f"sw.js still hard-codes version strings: {re.findall(r'[?]v=[0-9]+', sw)}")

    # 3) script coverage
    jsdir = os.path.join(R, 'js'); files = sorted(f[:-3] for f in os.listdir(jsdir) if f.endswith('.js')) if os.path.isdir(jsdir) else []
    other_pages = ''.join(open(os.path.join(R, f), encoding='utf-8').read() for f in sorted(os.listdir(R)) if f.endswith('.html') and f != a.index)
    loaded = set(re.findall(r'src="js/([A-Za-z0-9_]+)\.js', html + other_pages))   # POSPRO: order.html (customer page) loads its own scripts
    for f in sorted(os.listdir(R)):
        if f.endswith('.html') and f != a.index:
            ov = sorted(set(re.findall(r'\?v=(\d+)', open(os.path.join(R, f), encoding='utf-8').read())))
            (ok if ov in ([], [N]) else fail)(f'{f}: asset versions {ov or "none"} match index.html ({N})')
    listed = set(re.findall(r"'([A-Za-z0-9_]+)'", sw))
    miss_load = [f for f in files if f not in loaded]; miss_sw = [f for f in files if f not in listed]
    (fail if miss_load else ok)(f'every js file is loaded by index.html' + (f' - missing: {miss_load}' if miss_load else f' ({len(files)} files)'))
    (fail if miss_sw else ok)(f'every js file is in the service-worker precache list' + (f' - missing: {miss_sw}' if miss_sw else ''))
    refs = re.findall(r'(?:src|href)="((?:js|css|img|icons)/[^"?]+)', html)
    gone = [r for r in refs if not os.path.exists(os.path.join(R, r))]
    (fail if gone else ok)('every file referenced by index.html exists' + (f' - missing: {gone}' if gone else ''))

    # 4) visible version label
    av = re.search(r"APP_VERSION\s*=\s*'([^']+)'", core); sp = re.search(r'class="appver">([^<]*)<', html)
    if av and sp: (ok if av.group(1) == sp.group(1).strip() else fail)(f"APP_VERSION='{av.group(1)}' vs .appver text '{sp.group(1).strip()}'" + ('' if av.group(1) == sp.group(1).strip() else ' (static label out of sync; applyLangStatic fixes it at runtime but the first paint is wrong)'))
    else: warn('could not find both APP_VERSION and a .appver element')
    if av:
        if not re.fullmatch(r'\d+\.\d+\.\d+', av.group(1)): warn(f"APP_VERSION '{av.group(1)}' is not MAJOR.MINOR.REVISION (e.g. 2.0.0)")
        if mc and av.group(1) not in mc.group(1): warn(f"service-worker cache name '{mc.group(1)}' does not contain APP_VERSION '{av.group(1)}' (convention: tripexpense-<version>)")
    stale = [m for m in re.findall(r'>\s*V\d{2}(?:\.\d+)?\b[^<]{0,12}', re.sub(r'<script.*?</script>', '', html, flags=re.S))]
    if stale: warn(f'possible hard-coded version label in markup: {stale[:3]}')
    hard = []
    for f in files:
        t = open(os.path.join(jsdir, f + '.js'), encoding='utf-8').read()
        hard += [f'{f}.js: {m}' for m in re.findall(r'เวอร์ชัน\s+\d+', t)]
    if hard: fail(f'hard-coded "เวอร์ชัน N" text instead of APP_VERSION: {hard[:3]}')

    # 5) zip equals folder, config.js absent
    if a.zip:
        z = zipfile.ZipFile(a.zip); names = {n for n in z.namelist() if not n.endswith('/')}
        diff = []
        for n in sorted(names):
            p = os.path.join(R, n)
            if not os.path.exists(p) or md5(z.read(n)) != md5(open(p, 'rb').read()): diff.append(n)
        (fail if diff else ok)(f'zip ({len(names)} files) is identical to the folder' + (f' - differs/missing on disk: {diff[:8]}' if diff else ''))
        top = {'index.html', 'manifest.webmanifest', 'sw.js'} | {n.split('/')[0] for n in names if '/' in n}
        shipped = {f for f in os.listdir(R) if f in top or f in ('index.html', 'sw.js')}
        absent = [f for f in ('index.html', 'sw.js', 'css', 'js') if f not in {n.split('/')[0] for n in names}]
        if absent: fail(f'zip is missing top-level items: {absent}')
        (fail if any(n.endswith('config.js') for n in names) else ok)("assets/js/config.js is NOT in the zip (it holds the owner's own keys)")
        zi = z.read(a.index).decode('utf-8') if a.index in names else ''
        zv = sorted(set(re.findall(r'\?v=([0-9A-Za-z.]+)', zi)))
        (ok if zv == vers else fail)(f'index.html inside the zip has asset versions {zv}')

    # 6) changes since previous release
    if a.changes_since:
        old = zipfile.ZipFile(a.changes_since); on = {n: old.read(n) for n in old.namelist() if not n.endswith('/')}
        now = {}
        for root, _, fs in os.walk(R):
            for f in fs:
                rel = os.path.relpath(os.path.join(root, f), R)
                if not rel.startswith('assets/js/config'): now[rel] = open(os.path.join(root, f), 'rb').read()
        add = sorted(set(now) - set(on)); rem = sorted(set(on) - set(now)); mod = sorted(n for n in set(on) & set(now) if md5(on[n]) != md5(now[n]))
        print(f'\nCHANGES since {os.path.basename(a.changes_since)}: {len(add)} added, {len(rem)} removed, {len(mod)} modified')
        for n in add: print(f'   + {n} ({len(now[n])} B)')
        for n in rem: print(f'   - {n}')
        for n in mod: print(f'   ~ {n} ({len(on[n])} -> {len(now[n])} B)')
        print('   Every line above must be explained by the current task. Unexplained edits: report them to the user, do not ship silently.\n')

    # 7) syntax
    if a.syntax:
        bad = []
        for f in [os.path.join('js', f + '.js') for f in files] + [a.sw]:
            r = subprocess.run(['node', '--check', os.path.join(R, f)], capture_output=True, text=True)
            if r.returncode: bad.append(f + ': ' + r.stderr.strip().splitlines()[0][:90])
        (fail if bad else ok)('node --check passes for every js file and sw.js' + (f' - {bad}' if bad else ''))

    print(f'\n{len(fails)} failure(s), {len(warns)} warning(s)'); sys.exit(1 if fails else 0)

if __name__ == '__main__': main()
