#!/usr/bin/env python3
"""
main.py — Build the interactive OSM comparison map.

Run from any directory:
    python visualize_osm/main.py

Then serve and open the map:
    python visualize_osm/expose_server.py
"""
import sys
from pathlib import Path

# Ensure this package's directory is on sys.path when run as a script
# sys.path.insert(0, str(Path(__file__).resolve().parent))

from config        import PROJECT_ROOT
from data          import load_patches, build_all_meta
from map_builder   import build_map, inject_turf
from styles        import get_css
from templates     import static_html
from js_logic      import build_script
from toggle_button import get_toggle_html, get_toggle_css, get_toggle_js

HTML_PATH = Path(__file__).resolve().parent / "patches_map.html"


def main() -> None:
    patches      = load_patches()
    all_meta     = build_all_meta(patches)
    m, map_var, default_group, lazy_markers_json = build_map(patches, all_meta)
    inject_turf(str(HTML_PATH))

    with HTML_PATH.open("a") as f:
        f.write(get_css())
        f.write(get_toggle_css())
        f.write(static_html())
        f.write(get_toggle_html())
        f.write(build_script(all_meta, default_group.get_name(), map_var, lazy_markers_json))
        f.write(get_toggle_js(map_var))

    print(f"Map ready: {HTML_PATH}")
    print("Serve with: python expose_server.py")


if __name__ == "__main__":
    main()
