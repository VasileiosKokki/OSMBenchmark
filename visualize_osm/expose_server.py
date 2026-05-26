#!/usr/bin/env python3
"""
expose_server.py - Serve the project root over HTTP so the map can load
                   local GeoJSON files via relative URLs.

Run from any directory:
    python visualize_osm/expose_server.py

Then open: http://localhost:8000/
"""
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path

from config import PROJECT_ROOT

PORT = 8000


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def do_GET(self):
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        if self.path == "/":
            self.send_response(302)
            self.send_header("Location", "visualize_osm/patches_map.html")
            self.end_headers()
            return
        super().do_GET()


if __name__ == "__main__":
    httpd = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Serving {PROJECT_ROOT} at http://localhost:{PORT}")
    print(f"Open:   http://localhost:{PORT}/")
    httpd.serve_forever()
