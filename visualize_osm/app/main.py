#!/usr/bin/env python3
"""
app/main.py - Build the interactive OSM map.

Run standalone:
    python app/main.py

Or import and call build() from the top-level main.py.
"""
import sys
from pathlib import Path

# Ensure visualize_osm/ is on sys.path when run as a script
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.map_builder import build_map, inject_turf
from app.styles import get_css
from app.ui_fragments import static_html, get_toggle_html, get_toggle_css, get_toggle_js

HTML_PATH = Path(__file__).resolve().parents[1] / "patches_map.html"
CLIENT_SCRIPT_FILES = (
    "core.js",
    "features_layers.js",
    "panels.js",
    "patches_markers.js",
    "selection_interaction.js",
    "search_boot.js",
)


def build_script() -> str:
    client_dir = Path(__file__).with_name("client")
    chunks = [
        (client_dir / filename).read_text(encoding="utf-8").rstrip()
        for filename in CLIENT_SCRIPT_FILES
    ]
    return "<script>\n" + "\n\n".join(chunks) + "\n</script>\n"


def build_page() -> Path:
    build_map(HTML_PATH)
    inject_turf(str(HTML_PATH))

    controls = (
        get_css()
        + get_toggle_css()
        + static_html()
        + get_toggle_html()
    )
    scripts = (
        build_script()
        + get_toggle_js()
    )
    html = HTML_PATH.read_text(encoding="utf-8")
    html = html.replace("</body>", controls + "\n" + scripts + "\n</body>", 1)
    HTML_PATH.write_text(html, encoding="utf-8")
    return HTML_PATH


def build() -> Path:
    """Build the map HTML and return its path."""
    map_path = build_page()
    print(f"Map ready:   {map_path}")
    return map_path


if __name__ == "__main__":
    build()
    print("Serve with: python server/main.py")
