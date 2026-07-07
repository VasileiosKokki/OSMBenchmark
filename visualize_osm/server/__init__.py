"""
server/__init__.py — HTTP server package.

Ensures the project root (visualize_osm/) is on sys.path so that
`from config import ...` works regardless of how the package is invoked.
"""
import sys
from pathlib import Path

_pkg_root = Path(__file__).resolve().parent.parent  # …/visualize_osm/
if str(_pkg_root) not in sys.path:
    sys.path.insert(0, str(_pkg_root))
