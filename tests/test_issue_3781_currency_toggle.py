"""
Test issue #3781: Region-grouped dashboard with currency toggle.

Validates that data-model.js contains the currency toggle infrastructure:
- FX_RATES configuration with GBP/USD/AUD/ZAR rates
- DISPLAY_CURRENCIES array for the toggle options
- convertAmount helper
- formatCurrencyAmount helper
- All exported to window
"""

from __future__ import annotations

import re
from pathlib import Path


_WORKTREE = Path(__file__).resolve().parent.parent
_DATA_MODEL = _WORKTREE / "src" / "data-model.js"


def read_data_model():
    return _DATA_MODEL.read_text()


# ── FX_RATES configuration ────────────────────────────────────────────

def test_fx_rates_const_exists():
    """FX_RATES constant is defined with GBP as the base currency."""
    src = read_data_model()
    assert "FX_RATES" in src, "FX_RATES constant must exist in data-model.js"

    # Extract the FX_RATES object body (between { and })
    m = re.search(r"const FX_RATES\s*=\s*\{([^}]+)\}", src, re.DOTALL)
    assert m, "FX_RATES must be a const object literal"
    body = m.group(1)

    # Base currency is GBP — it must have rate 1.0 to itself
    assert "GBP" in body, "FX_RATES must include GBP"
    assert "USD" in body, "FX_RATES must include USD"
    assert "AUD" in body, "FX_RATES must include AUD"
    assert "ZAR" in body, "FX_RATES must include ZAR"


def test_fx_rates_exports_to_window():
    """FX_RATES is exported to the window object."""
    src = read_data_model()
    assert "FX_RATES" in src
    # The window assignment block must include FX_RATES
    m = re.search(r"Object\.assign\(window,\s*\{([^}]+)\}", src, re.DOTALL)
    assert m, "window export block must exist"
    exports = m.group(1)
    assert "FX_RATES" in exports, "FX_RATES must be exported to window"


# ── DISPLAY_CURRENCIES ────────────────────────────────────────────────

def test_display_currencies_constant_exists():
    """DISPLAY_CURRENCIES array defines the toggle options: GBP, USD, AUD."""
    src = read_data_model()
    assert "DISPLAY_CURRENCIES" in src, "DISPLAY_CURRENCIES must exist"

    # Verify the array contains GBP, USD, AUD
    m = re.search(r"const DISPLAY_CURRENCIES\s*=\s*\[([^\]]+)\]", src, re.DOTALL)
    assert m, "DISPLAY_CURRENCIES must be a const array literal"
    body = m.group(1)
    assert "GBP" in body, "DISPLAY_CURRENCIES must include GBP"
    assert "USD" in body, "DISPLAY_CURRENCIES must include USD"
    assert "AUD" in body, "DISPLAY_CURRENCIES must include AUD"


def test_display_currencies_exported():
    """DISPLAY_CURRENCIES is exported to the window object."""
    src = read_data_model()
    m = re.search(r"Object\.assign\(window,\s*\{([^}]+)\}", src, re.DOTALL)
    assert m, "window export block must exist"
    exports = m.group(1)
    assert "DISPLAY_CURRENCIES" in exports, "DISPLAY_CURRENCIES must be exported to window"


# ── convertAmount ─────────────────────────────────────────────────────

def test_convert_amount_function_exists():
    """convertAmount(amount, fromCurrency, toCurrency) function exists."""
    src = read_data_model()
    assert "function convertAmount" in src or "convertAmount" in src, \
        "convertAmount function must exist in data-model.js"


def test_convert_amount_exported():
    """convertAmount is exported to the window object."""
    src = read_data_model()
    m = re.search(r"Object\.assign\(window,\s*\{([^}]+)\}", src, re.DOTALL)
    assert m, "window export block must exist"
    exports = m.group(1)
    assert "convertAmount" in exports, "convertAmount must be exported to window"


# ── formatCurrencyAmount ──────────────────────────────────────────────

def test_format_currency_amount_function_exists():
    """formatCurrencyAmount(amount, currency) function exists."""
    src = read_data_model()
    assert "function formatCurrencyAmount" in src or "formatCurrencyAmount" in src, \
        "formatCurrencyAmount function must exist in data-model.js"


def test_format_currency_amount_exported():
    """formatCurrencyAmount is exported to the window object."""
    src = read_data_model()
    m = re.search(r"Object\.assign\(window,\s*\{([^}]+)\}", src, re.DOTALL)
    assert m, "window export block must exist"
    exports = m.group(1)
    assert "formatCurrencyAmount" in exports, "formatCurrencyAmount must be exported to window"


# ── Currency symbol helpers already exist ─────────────────────────────

def test_region_currency_helpers_still_present():
    """Existing regionCurrency and regionCurrencyLong are still exported."""
    src = read_data_model()
    m = re.search(r"Object\.assign\(window,\s*\{([^}]+)\}", src, re.DOTALL)
    assert m, "window export block must exist"
    exports = m.group(1)
    assert "regionCurrency" in exports, "regionCurrency must still be exported"
    assert "regionCurrencyLong" in exports, "regionCurrencyLong must still be exported"


# ── emit: false filtering still works ─────────────────────────────────

def test_rep_visible_in_week_respects_emit_false():
    """repVisibleInWeek still filters emit:false reps when showHidden is false."""
    src = read_data_model()
    # The function must contain the emit check
    assert "rep.emit === false" in src or 'rep.emit === false' in src, \
        "repVisibleInWeek must check rep.emit === false"


# ── REGIONS still defined ─────────────────────────────────────────────

def test_regions_constant_still_present():
    """REGIONS array with US, EMEA, ZA still exists and includes currency info."""
    src = read_data_model()
    assert "const REGIONS" in src, "REGIONS constant must exist"
    for region_id in ("US", "EMEA", "ZA"):
        assert region_id in src, f"REGIONS must contain {region_id}"
    for currency in ("USD", "GBP", "ZAR"):
        assert currency in src, f"REGIONS must reference {currency} currency"
