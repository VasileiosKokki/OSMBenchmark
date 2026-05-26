"""
map_builder.py — Creates the Folium map, adds marker groups, and saves the
                 base HTML (before CSS/JS injection).

Only the default backend's markers are added via Folium (rendered on load).
All other backends' marker data is returned as a plain dict so js_logic.py
can build and add their Leaflet layers lazily on first switch.
"""
import json
from pathlib import Path
import folium
from config import BACKEND_LIST, DEFAULT_BACKEND, ICON_COLORS


def build_map(patches, all_meta):
    """
    Build a Folium Map with markers for the default backend only.
    Returns (map_object, map_var, default_group, lazy_markers_json).

    lazy_markers_json — JSON string of {backend: [{lat, lon, patch_id, color}]}
                        for all non-default backends, to be built by JS.
    """
    m = folium.Map(location=[39.0, 22.0], zoom_start=7)
    map_var = m.get_name()

    # Default backend: full Folium FeatureGroup (rendered at load)
    default_group = folium.FeatureGroup(
        name=f'Patches — {DEFAULT_BACKEND}',
        show=True
    )

    default_bi = BACKEND_LIST.index(DEFAULT_BACKEND)
    for i, fn, lon, lat in patches:
        if str(i) not in all_meta[DEFAULT_BACKEND]:
            continue
        folium.Marker(
            location=[lat, lon],
            icon=folium.Icon(
                color=ICON_COLORS[default_bi % len(ICON_COLORS)],
                icon='circle',
                prefix='fa'
            ),
            tooltip=f"osm_{i} ({DEFAULT_BACKEND}) — click to toggle OSM features",
            popup=folium.Popup(
                f'<button data-patch="{i}" '
                f'style="padding:6px 12px;cursor:pointer;background:#eee;'
                f'border:1px solid #ccc;border-radius:4px;'
                f'white-space:nowrap;display:inline-block;">'
                f'Show OSM Features</button>',
                max_width=260
            )
        ).add_to(default_group)

    default_group.add_to(m)
    folium.LayerControl().add_to(m)

    # Non-default backends: collect marker data as JSON for lazy JS rendering
    lazy_markers = {}
    for bi, backend in enumerate(BACKEND_LIST):
        if backend == DEFAULT_BACKEND:
            continue
        markers = []
        for i, fn, lon, lat in patches:
            if str(i) not in all_meta[backend]:
                continue
            markers.append({
                'lat':      lat,
                'lon':      lon,
                'patch_id': str(i),
                'color':    ICON_COLORS[bi % len(ICON_COLORS)],
            })
        lazy_markers[backend] = markers

    html_path = str(Path(__file__).resolve().parent / "patches_map.html")
    m.save(html_path)
    return m, map_var, default_group, json.dumps(lazy_markers)


def inject_turf(html_path: str | None = None):
    if html_path is None:
        html_path = str(Path(__file__).resolve().parent / "patches_map.html")
    """Inject Turf.js CDN script tag into the saved HTML file."""
    with open(html_path, 'r') as f:
        html = f.read()
    html = html.replace(
        '</head>',
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js"></script>\n</head>',
        1
    )
    with open(html_path, 'w') as f:
        f.write(html)