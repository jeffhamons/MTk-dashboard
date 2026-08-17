#!/usr/bin/env python3
"""Verify a deployed bundle against a local rebuild, across machines.

Hash-comparing dist/index.html against the deployed file does not work: zlib's
compressed output is not standardized, so Netlify's Linux build and a local
macOS rebuild of the same commit differ byte-for-byte. Every compressed payload
differs; the content does not.

This compares what the bundle *contains* instead — the decompressed payloads and
the uuid5 asset placeholders, both of which are platform-independent.

Usage:
    python3 build/bundle.py
    python3 build/verify_deploy.py                 # against production
    python3 build/verify_deploy.py --url <url>     # e.g. a deploy preview
    python3 build/verify_deploy.py --local dist/index.html
"""

import argparse
import base64
import gzip
import hashlib
import re
import sys
import urllib.request
from pathlib import Path

PROD_URL = "https://na-rep-dashboard.netlify.app/"
REPO_ROOT = Path(__file__).resolve().parent.parent

BLOB = re.compile(r'"([A-Za-z0-9+/]{200,}={0,2})"')
UUID5 = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
)


def fingerprint(html: str) -> tuple[set[str], set[str]]:
    """(hashes of decompressed payloads, uuid5 placeholders)."""
    payloads = set()
    for match in BLOB.finditer(html):
        raw = base64.b64decode(match.group(1))
        if raw[:2] != b"\x1f\x8b":
            continue
        try:
            payloads.add(hashlib.md5(gzip.decompress(raw)).hexdigest())
        except (OSError, EOFError):
            continue
    return payloads, set(UUID5.findall(html))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=PROD_URL, help=f"deployed bundle (default {PROD_URL})")
    ap.add_argument("--local", default=str(REPO_ROOT / "dist" / "index.html"))
    args = ap.parse_args()

    local_path = Path(args.local)
    if not local_path.is_file():
        print(f"missing {local_path} — run: python3 build/bundle.py", file=sys.stderr)
        return 2

    with urllib.request.urlopen(args.url) as response:
        remote_html = response.read().decode("utf8", "replace")
    local_html = local_path.read_text(encoding="utf8", errors="replace")

    remote_payloads, remote_ids = fingerprint(remote_html)
    local_payloads, local_ids = fingerprint(local_html)

    payloads_ok = remote_payloads == local_payloads
    ids_ok = remote_ids == local_ids

    print(f"deployed : {args.url}")
    print(f"local    : {local_path}")
    print(f"payloads : {len(remote_payloads)} remote / {len(local_payloads)} local — "
          f"{'match' if payloads_ok else 'DIFFER'}")
    print(f"asset ids: {len(remote_ids)} remote / {len(local_ids)} local — "
          f"{'match' if ids_ok else 'DIFFER'}")

    if payloads_ok and ids_ok:
        print("\nOK — the deployed bundle contains exactly this source tree.")
        print("(Raw bytes still differ across machines; that is expected — see README.)")
        return 0

    for label, remote, local in (
        ("payload", remote_payloads, local_payloads),
        ("asset id", remote_ids, local_ids),
    ):
        for item in sorted(remote - local):
            print(f"  only deployed: {label} {item}")
        for item in sorted(local - remote):
            print(f"  only local   : {label} {item}")
    print("\nMISMATCH — the deployed bundle is not this source tree.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
