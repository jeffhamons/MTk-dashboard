"""The deploy bundle must be byte-for-byte reproducible.

build/bundle.py used to bake two sources of per-build randomness into
dist/index.html: gzip.compress() stamped the current clock into every
compressed payload's header, and each asset placeholder was a fresh
uuid4(). Two builds of an identical source tree therefore produced
different bytes, so a deployed bundle could not be verified by rebuilding
and comparing hashes -- the only check available for a single-file artifact
with no lockfile and no build id.

Scope: reproducible for a given Python version. Compression internals differ
across major versions, so a 3.12 build and a 3.14 build of the same tree are
not byte-identical -- compare rebuilds using the version that produced the
artifact. Note also that Python 3.14 zeroes the gzip mtime by default while
3.11-3.13 stamp the clock, so the byte-level assertion below is only load
bearing on the older versions; test_gzip_call_pins_mtime_and_level is the
check that holds everywhere.

Run: python3 -m pytest tests/test_bundle_reproducible.py -q
"""

import gzip
import importlib.util
import re
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BUNDLE_PY = REPO_ROOT / "build" / "bundle.py"


def load_bundle_module():
    spec = importlib.util.spec_from_file_location("bundle_under_test", BUNDLE_PY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bundle = load_bundle_module()


def test_collect_assets_is_deterministic():
    """The whole pipeline: same tree in, identical manifest and template out."""
    manifest_a, template_a = bundle.collect_assets()
    manifest_b, template_b = bundle.collect_assets()
    assert manifest_a == manifest_b, "manifest differs between builds"
    assert template_a == template_b, "rewritten template differs between builds"
    assert list(manifest_a) == list(manifest_b), "asset ordering differs"


def test_encode_asset_is_deterministic():
    target = REPO_ROOT / "src" / "data-model.js"
    assert bundle.encode_asset(target) == bundle.encode_asset(target)


def test_gzip_payloads_carry_no_timestamp():
    """Bytes 4-8 of a gzip header are MTIME; they must be zero."""
    target = REPO_ROOT / "src" / "data-model.js"
    entry = bundle.encode_asset(target)
    assert entry["compressed"], "text assets are expected to be gzipped"

    import base64

    raw = base64.b64decode(entry["data"])
    assert raw[:2] == b"\x1f\x8b", "gzip magic"
    assert raw[4:8] == b"\x00\x00\x00\x00", "gzip MTIME must be zeroed"
    # Still valid gzip that round-trips to the original file.
    assert gzip.decompress(raw) == target.read_bytes()


def test_asset_ids_are_derived_from_path_not_random():
    """uuid5(namespace, rel_path) — stable across builds and across machines."""
    src = BUNDLE_PY.read_text()
    assert "uuid.uuid4()" not in src, (
        "uuid4 makes every build unique regardless of whether sources changed; "
        "use uuid5(ASSET_NAMESPACE, rel_path)"
    )
    assert "uuid.uuid5(" in src

    manifest, template = bundle.collect_assets()
    expected = str(uuid.uuid5(bundle.ASSET_NAMESPACE, "src/data-model.js"))
    assert expected in manifest, "data-model.js placeholder is path-derived"
    assert expected in template, "template references the same placeholder"


def test_gzip_call_pins_mtime_and_level():
    src = BUNDLE_PY.read_text()
    call = re.search(r"gzip\.compress\(([^)]*)\)", src)
    assert call, "bundle.py still compresses with gzip"
    args = call.group(1)
    assert "mtime=0" in args, "gzip.compress must pin mtime=0"
    assert "compresslevel=" in args, "pin compresslevel so output survives Python upgrades"


def test_every_referenced_asset_resolves():
    """Guards the uuid5 swap: placeholders must still map 1:1 to real files."""
    manifest, template = bundle.collect_assets()
    assert manifest, "bundle found at least one asset"
    for uid in manifest:
        assert uid in template, f"placeholder {uid} missing from template"
    # No un-rewritten local references should survive in the template.
    leftovers = re.findall(r'(?:src|href)="((?:src|vendor|assets)/[^"]+)"', template)
    assert leftovers == [], f"unrewritten asset references: {leftovers}"
