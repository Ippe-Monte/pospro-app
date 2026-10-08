#!/usr/bin/env python3
"""Bump every place a release version lives, in one go (hand-editing with sed has missed one every time).

Version scheme (from V2.0.0):  MAJOR.MINOR.REVISION  e.g. 2.0.0 -> 2.0.1 -> 2.0.2 ...  Roll the REVISION up on EVERY edit that is released.

Usage:
  python bump_version.py --root /path/to/app --revision            # 2.0.0 -> 2.0.1   (the normal case: any edit)
  python bump_version.py --root /path/to/app --minor               # 2.0.7 -> 2.1.0   (new feature)
  python bump_version.py --root /path/to/app --major               # 2.3.4 -> 3.0.0   (new generation)
  python bump_version.py --root /path/to/app --app-version 2.0.0 [--asset N] [--cache NAME]   # set explicitly
  add --dry-run to see the plan without writing.

What changes together: ?v=N in index.html and const V in sw.js (N = old + 1, a plain counter), const CACHE in sw.js
(= tripexpense-<version>), APP_VERSION in js/core.js and the visible .appver label in index.html.
A two-part old version such as 19.0 is read as 19.0.0.  Always run check_release.py afterwards.
"""
import argparse, os, re, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True); ap.add_argument('--asset'); ap.add_argument('--app-version'); ap.add_argument('--cache')
    ap.add_argument('--revision', action='store_true'); ap.add_argument('--minor', action='store_true'); ap.add_argument('--major', action='store_true')
    ap.add_argument('--dry-run', action='store_true'); a = ap.parse_args()
    P = lambda f: os.path.join(a.root, f)
    html, sw, core = (open(P(f), encoding='utf-8').read() for f in ('index.html', 'sw.js', 'js/core.js'))
    cur = sorted(set(re.findall(r'\?v=(\d+)', html)))
    if len(cur) != 1: sys.exit(f'index.html has mixed or no ?v= values {cur}; fix by hand first')
    if sum([a.revision, a.minor, a.major]) > 1: sys.exit('use only one of --revision / --minor / --major')
    if a.revision or a.minor or a.major:
        mv = re.search(r"APP_VERSION\s*=\s*'([0-9.]+)'", core)
        if not mv: sys.exit("js/core.js has no APP_VERSION='x.y.z'")
        parts = [int(x) for x in mv.group(1).split('.')] + [0, 0, 0]; ma, mi, rv = parts[:3]
        ma, mi, rv = (ma + 1, 0, 0) if a.major else ((ma, mi + 1, 0) if a.minor else (ma, mi, rv + 1))
        a.app_version = f'{ma}.{mi}.{rv}'
    new_asset = a.asset or str(int(cur[0]) + 1)
    mc = re.search(r"const\s+CACHE\s*=\s*'([^']+)'", sw)
    if not mc: sys.exit("sw.js has no const CACHE='...'")
    num = re.search(r'(\d+)$', mc.group(1))
    new_cache = a.cache or (f'pospro-{a.app_version}' if a.app_version else (mc.group(1)[:num.start()] + str(int(num.group(1)) + 1) if num else mc.group(1) + '-2'))
    html2, n_html = re.subn(r'\?v=\d+', f'?v={new_asset}', html)
    sw2, n_v = re.subn(r"(const\s+V\s*=\s*')[^']*(')", rf"\g<1>{new_asset}\g<2>", sw)
    sw2, n_c = re.subn(r"(const\s+CACHE\s*=\s*')[^']*(')", rf"\g<1>{new_cache}\g<2>", sw2)
    if n_v != 1: sys.exit("sw.js: expected exactly one const V='...'")
    core2 = core
    if a.app_version:
        core2, n_a = re.subn(r"(APP_VERSION\s*=\s*')[^']*(')", rf"\g<1>{a.app_version}\g<2>", core)
        html2, n_l = re.subn(r'(class="appver">)[^<]*(<)', rf'\g<1>{a.app_version}\g<2>', html2)
        if n_a != 1 or n_l != 1: sys.exit(f'APP_VERSION edits: core={n_a} label={n_l} (expected 1 and 1)')
    print(f'asset version  {cur[0]} -> {new_asset}   ({n_html} URLs in index.html, const V in sw.js)')
    print(f'cache name     {mc.group(1)} -> {new_cache}')
    if a.app_version: print(f'APP_VERSION    -> {a.app_version}  (core.js + .appver label)')
    if a.dry_run: print('dry run: nothing written'); return
    for f, t in (('index.html', html2), ('sw.js', sw2), ('js/core.js', core2)): open(P(f), 'w', encoding='utf-8').write(t)
    for f in sorted(os.listdir(a.root)):            # POSPRO: other pages (order.html) share the same ?v= counter
        if f.endswith('.html') and f != 'index.html':
            t = open(P(f), encoding='utf-8').read(); t2, n = re.subn(r'\?v=\d+', f'?v={new_asset}', t)
            if n: open(P(f), 'w', encoding='utf-8').write(t2); print(f'               {n} URLs in {f}')
    print('written. Now run check_release.py')

if __name__ == '__main__': main()
