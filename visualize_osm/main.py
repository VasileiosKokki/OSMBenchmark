#!/usr/bin/env python3
"""
main.py — Build the OSM map and serve it.

Usage:
    python main.py            # build + serve
    python main.py --build    # build only
    python main.py --serve    # serve only (map must already exist)

Individual entry points:
    python app/main.py        # build only
    python server/main.py     # serve only
"""
import sys
import argparse
from pathlib import Path

# Ensure this directory is on sys.path for 'app' and 'server' sub-packages
_here = Path(__file__).resolve().parent
sys.path.insert(0, str(_here))
sys.path.insert(0, str(_here.parent))  # adds ~/osm_benchmark/ so 'create_osm' is found

from app.main import build
from server.main import serve


def main() -> None:
    parser = argparse.ArgumentParser(description="OSM map builder and server")
    group  = parser.add_mutually_exclusive_group()
    group.add_argument("--build", action="store_true", help="Build the map only")
    group.add_argument("--serve", action="store_true", help="Serve the map only")
    parser.add_argument("--port", type=int, default=8001, help="HTTP port for serving")
    args = parser.parse_args()

    if args.build:
        build()
    elif args.serve:
        serve(args.port)
    else:
        build()
        serve(args.port)


if __name__ == "__main__":
    main()
