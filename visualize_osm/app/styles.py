"""styles.py - Reads CSS injected into the generated map page."""
from pathlib import Path


def get_css() -> str:
    css_path = Path(__file__).with_name("static") / "map.css"
    css = css_path.read_text(encoding="utf-8").rstrip()
    return f"<style>\n{css}\n</style>\n"
