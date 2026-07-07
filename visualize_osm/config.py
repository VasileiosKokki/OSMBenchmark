"""
config.py — Project-wide constants: paths, backends, and color definitions.
"""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

INDEX_PATH = PROJECT_ROOT / "index_greece.csv"

DIST = 1280  # metres — half of the 2560 m patch side

DATA_ROOT = PROJECT_ROOT / "data"

BACKENDS = {
    d.name: d
    for d in DATA_ROOT.iterdir()
    if d.is_dir()
} if DATA_ROOT.exists() else {}

BACKEND_LIST    = list(BACKENDS.keys())
DEFAULT_BACKEND = BACKEND_LIST[0]

# Colors — single source of truth, shared by markers AND buttons
ICON_COLORS = ["orange", "green", "blue", "red", "purple", "cadetblue", "gray"]

MARKER_COLOR_HEX = {
    "orange":    "#f60",
    "green":     "#2e7d32",
    "blue":      "#2979ff",
    "red":       "#c62828",
    "purple":    "#6a1b9a",
    "cadetblue": "#00838f",
    "gray":      "#757575",
}

BACKEND_COLORS = {
    name: MARKER_COLOR_HEX[ICON_COLORS[bi % len(ICON_COLORS)]]
    for bi, name in enumerate(BACKEND_LIST)
}
