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


# Loader script — mirrors the proven Claude Design loader (the one whose
# original artifact downloads actually worked). Two non-obvious parts:
#   (a) For text/babel scripts with a src=blob: URL, we fetch the blob and
#       inline the content. Babel's transformScriptTags does an XHR against
#       src= and blob URLs created from base64 data don't reliably reach the
#       transformer — inlining makes each one a plain inline babel script,
#       which transformScriptTags handles unconditionally.
#   (b) Babel-standalone hooks DOMContentLoaded to auto-process text/babel
#       scripts. That already fired on the outer page before we swapped the
#       document, so we call window.Babel.transformScriptTags() manually
#       once all scripts are in place.
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

    setStatus('Rendering...');
    for (const uuid of uuids) template = template.split(uuid).join(blobUrls[uuid]);

    // Strip integrity + crossorigin — blob URLs inherit a null origin, so
    // crossorigin forces a CORS fetch that SRI then rejects.
    template = template.replace(/\s+integrity="[^"]*"/gi, '').replace(/\s+crossorigin="[^"]*"/gi, '');

    // Swap the document and re-create script tags so they execute (DOMParser
    // marks them already-started). Order is preserved by awaiting onload for
    // src= scripts — React must finish before ReactDOM before Babel.
    const doc = new DOMParser().parseFromString(template, 'text/html');
    document.documentElement.replaceWith(doc.documentElement);
    const dead = Array.from(document.scripts);
    for (const old of dead) {
      const s = document.createElement('script');
      for (const a of old.attributes) s.setAttribute(a.name, a.value);
      s.textContent = old.textContent;
      // text/babel + src=blob: → inline the fetched text and drop src.
      if ((s.type === 'text/babel' || s.type === 'text/jsx') && s.src) {
        const r = await fetch(s.src);
        s.textContent = await r.text();
        s.removeAttribute('src');
      }
      const waitForLoad = s.src ? new Promise(function(r) { s.onload = s.onerror = r; }) : null;
      old.replaceWith(s);
      if (waitForLoad) await waitForLoad;
    }
    // Babel.transformScriptTags() auto-fires on DOMContentLoaded, which
    // already fired on the outer page. Trigger it manually now that the
    // text/babel scripts are in the live document.
    if (window.Babel && typeof window.Babel.transformScriptTags === 'function') {
      window.Babel.transformScriptTags();
    }
  } catch (err) {
    setStatus('Error unpacking: ' + err.message);
    console.error('Bundle unpack error:', err);
  }
});
""".strip()


# Outer "loading shell" HTML — what the user sees while we decode the bundle.
# The splash logo is inlined as a data URI so it can render BEFORE any JS
# fires (the bundler hasn't materialized blob URLs for the real assets yet).
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
    #__bundler_thumbnail img{{max-width:240px;max-height:240px;object-fit:contain}}
  </style>
  <noscript>
    <style>#__bundler_loading{{display:none}}</style>
    <div style="position:fixed;bottom:12px;left:12px;font:13px/1.4 -apple-system,sans-serif;color:#999;background:rgba(255,255,255,0.9);padding:6px 12px;border-radius:6px;z-index:10000">This page requires JavaScript to display.</div>
  </noscript>
</head>
<body>
  <div id="__bundler_thumbnail">
    <img src="{splash_logo}" alt="Mindtools Kineo">
  </div>
  <div id="__bundler_loading">Unpacking...</div>
  <script type="__bundler/manifest">{manifest_json}</script>
  <script type="__bundler/template">{template_json}</script>
  <script>{loader}</script>
</body>
</html>
"""

# Inline the brand logo as a data URI for the splash screen. This runs at
# build time so the data is in the outer HTML, paintable immediately on first
# byte — no waiting for the bundler to materialize blob URLs.
def splash_logo_data_uri() -> str:
    logo = REPO_ROOT / "assets" / "mindtools-logo.png"
    if not logo.is_file():
        return ""
    b64 = base64.b64encode(logo.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{b64}"


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

    # Escape `</` to `<\/` in JSON output: the browser's HTML parser eagerly
    # closes a <script> tag at the FIRST `</script>` it sees, even inside JSON
    # content. The template embeds the dashboard's <script> tags as data, so
    # without this escape the HTML parser truncates the template at its first
    # nested `</script>` and JSON.parse fails on the unterminated string.
    # JSON spec allows `\/` as a valid escape for `/` (json.dumps doesn't emit
    # it by default), so this is a no-op for any JSON parser.
    def js_safe(obj):
        return json.dumps(obj).replace("</", "<\\/")

    out_html = SHELL_HTML.format(
        title=title,
        splash_logo=splash_logo_data_uri(),
        manifest_json=js_safe(manifest),
        template_json=js_safe(template),
        loader=LOADER_SCRIPT,
    )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(out_html)
    print(f"  wrote {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
