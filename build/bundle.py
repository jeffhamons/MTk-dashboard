#!/usr/bin/env python3
"""
Re-pack index.html + src/ + vendor/ + assets/ into a single self-contained HTML
that matches the bundler format used by Claude Design.

Usage:
    python3 build/bundle.py            # writes dist/index.html
    python3 build/bundle.py --check    # prints summary, no write

The output is one HTML file with all assets inlined as base64-gzip blobs.
Drop it onto Netlify (or open it directly in a browser) — no server, no deps.
"""

import argparse
import base64
import gzip
import json
import mimetypes
import re
import sys
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
INDEX_HTML = REPO_ROOT / "index.html"
DIST = REPO_ROOT / "dist"

MIME_OVERRIDES = {
    ".js":    "application/javascript",
    ".jsx":   "application/javascript",
    ".woff2": "font/woff2",
    ".png":   "image/png",
}

# Mimes worth gzipping (text-y). Skip for already-compressed formats (woff2, png).
GZIP_MIMES = {"application/javascript", "text/javascript", "text/css", "application/json"}


def mime_for(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in MIME_OVERRIDES:
        return MIME_OVERRIDES[ext]
    guess, _ = mimetypes.guess_type(path.name)
    return guess or "application/octet-stream"


def encode_asset(path: Path) -> dict:
    raw = path.read_bytes()
    mime = mime_for(path)
    compressed = mime in GZIP_MIMES
    payload = gzip.compress(raw) if compressed else raw
    return {
        "mime": mime,
        "compressed": compressed,
        "data": base64.b64encode(payload).decode("ascii"),
    }


# Loader script — same shape Claude Design uses: read manifest, decode + decompress
# each asset, materialize a Blob URL per UUID, replace <script>/<link>/<img>/url()
# references in the inner template, then replaceWith(document.documentElement).
LOADER_SCRIPT = r"""
document.addEventListener('DOMContentLoaded', async function() {
  const loading = document.getElementById('__bundler_loading');
  function setStatus(msg) { if (loading) loading.textContent = msg; }

  window.addEventListener('error', function(e) {
    var p = document.body || document.documentElement;
    var d = document.getElementById('__bundler_err') || p.appendChild(document.createElement('div'));
    d.id = '__bundler_err';
    d.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;font:12px/1.4 ui-monospace,monospace;background:#2a1215;color:#ff8a80;padding:10px 14px;border-radius:8px;border:1px solid #5c2b2e;z-index:99999;white-space:pre-wrap;max-height:40vh;overflow:auto';
    d.textContent = (d.textContent ? d.textContent + String.fromCharCode(10) : '') +
      '[bundle] ' + (e.message || e.type) +
      (e.filename ? ' (' + e.filename.slice(0, 60) + ':' + e.lineno + ')' : '');
  }, true);

  try {
    const manifestEl = document.querySelector('script[type="__bundler/manifest"]');
    const templateEl = document.querySelector('script[type="__bundler/template"]');
    if (!manifestEl || !templateEl) {
      setStatus('Error: missing bundle data'); return;
    }

    const manifest = JSON.parse(manifestEl.textContent);
    let template = JSON.parse(templateEl.textContent);
    const uuids = Object.keys(manifest);
    setStatus('Unpacking ' + uuids.length + ' assets...');

    const blobUrls = {};
    await Promise.all(uuids.map(async (uuid) => {
      const entry = manifest[uuid];
      try {
        const binaryStr = atob(entry.data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        let finalBytes = bytes;
        if (entry.compressed) {
          const ds = new DecompressionStream('gzip');
          const writer = ds.writable.getWriter();
          const reader = ds.readable.getReader();
          writer.write(bytes); writer.close();
          const chunks = []; let totalLen = 0;
          while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); totalLen += value.length; }
          finalBytes = new Uint8Array(totalLen);
          let offset = 0; for (const c of chunks) { finalBytes.set(c, offset); offset += c.length; }
        }
        blobUrls[uuid] = URL.createObjectURL(new Blob([finalBytes], { type: entry.mime }));
      } catch (err) {
        console.error('Failed to decode asset ' + uuid + ':', err);
        blobUrls[uuid] = URL.createObjectURL(new Blob([], { type: entry.mime }));
      }
    }));

    // Substitute UUIDs in template
    for (const [uuid, url] of Object.entries(blobUrls)) {
      template = template.split(uuid).join(url);
    }

    setStatus('Mounting...');
    // Parse the inner template HTML and swap it in
    const parser = new DOMParser();
    const doc = parser.parseFromString(template, 'text/html');
    // Move <head> and <body> contents into the live document
    document.documentElement.replaceWith(doc.documentElement);

    // After the swap, re-execute every <script> tag that the parser left inert.
    // (DOMParser-created <script> elements don't run when inserted.)
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const old of scripts) {
      const s = document.createElement('script');
      for (const a of old.attributes) s.setAttribute(a.name, a.value);
      if (old.textContent) s.textContent = old.textContent;
      old.replaceWith(s);
      // For src= scripts, wait for load before continuing so Babel parses correctly
      if (s.src) {
        await new Promise((res, rej) => { s.onload = res; s.onerror = rej; });
      }
    }
  } catch (e) {
    console.error('[bundler] fatal:', e);
    setStatus('Error: ' + (e.message || String(e)));
  }
});
""".strip()


# Outer "loading shell" HTML — what the user sees while we decode the bundle.
SHELL_HTML = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{title}</title>
  <style>
    *{{margin:0;padding:0;box-sizing:border-box}}
    body{{background:#faf9f5;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,sans-serif}}
    #__bundler_loading{{position:fixed;bottom:20px;right:20px;font:13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;color:#666;background:#fff;padding:8px 14px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.12);z-index:10000}}
    #__bundler_thumbnail{{position:fixed;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#faf9f5;z-index:9999}}
    #__bundler_thumbnail svg{{width:100%;height:100%;object-fit:contain}}
  </style>
  <noscript>
    <style>#__bundler_loading{{display:none}}</style>
    <div style="position:fixed;bottom:12px;left:12px;font:13px/1.4 -apple-system,sans-serif;color:#999;background:rgba(255,255,255,0.9);padding:6px 12px;border-radius:6px;z-index:10000">This page requires JavaScript to display.</div>
  </noscript>
</head>
<body>
  <div id="__bundler_thumbnail">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="#5D5BED"/>
      <circle cx="50" cy="50" r="22" fill="#FDBC00"/>
      <path d="M 38 56 Q 42 42 46 56 Q 50 42 54 56 Q 58 42 62 56" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
  <div id="__bundler_loading">Unpacking...</div>
  <script type="__bundler/manifest">{manifest_json}</script>
  <script type="__bundler/template">{template_json}</script>
  <script>{loader}</script>
</body>
</html>
"""


def collect_assets() -> tuple[dict, str]:
    """Read index.html, find every src=/href= path under src/, vendor/, assets/,
    replace each with a fresh UUID, and return (manifest, rewritten_template).
    """
    html = INDEX_HTML.read_text()
    manifest = {}
    path_to_uuid: dict[str, str] = {}

    # Two reference shapes to handle:
    #   <script src="src/foo.jsx">        — html attributes
    #   url("assets/fonts/inter-01.woff2") — CSS @font-face declarations
    attr_pattern = re.compile(r'(src|href)="(src/[^"]+|vendor/[^"]+|assets/[^"]+)"')
    url_pattern  = re.compile(r'url\("(src/[^"]+|vendor/[^"]+|assets/[^"]+)"\)')

    def rel_to_uuid(rel_path: str) -> str:
        if rel_path in path_to_uuid:
            return path_to_uuid[rel_path]
        abs_path = REPO_ROOT / rel_path
        if not abs_path.is_file():
            raise SystemExit(f"missing referenced file: {rel_path}")
        uid = str(uuid.uuid4())
        manifest[uid] = encode_asset(abs_path)
        path_to_uuid[rel_path] = uid
        return uid

    rewritten = attr_pattern.sub(
        lambda m: f'{m.group(1)}="{rel_to_uuid(m.group(2))}"', html
    )
    rewritten = url_pattern.sub(
        lambda m: f'url("{rel_to_uuid(m.group(1))}")', rewritten
    )
    return manifest, rewritten


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Print summary, no write")
    parser.add_argument("--out", default=str(DIST / "index.html"), help="Output path")
    args = parser.parse_args()

    manifest, template = collect_assets()

    # Pull title from template
    title_match = re.search(r"<title>([^<]*)</title>", template)
    title = title_match.group(1) if title_match else "App"

    total_raw = sum(len(base64.b64decode(e["data"])) for e in manifest.values())
    print(f"  assets: {len(manifest)}")
    print(f"  total raw size: {total_raw / 1024:.1f} KB")

    if args.check:
        return 0

    out_html = SHELL_HTML.format(
        title=title,
        manifest_json=json.dumps(manifest),
        template_json=json.dumps(template),
        loader=LOADER_SCRIPT,
    )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(out_html)
    print(f"  wrote {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
