"""
templates.py — Generates the static HTML snippets injected into patches_map.html.
"""
def static_html() -> str:
    return """
<div id="patch-search">
  <select id="patch-search-type">
    <option value="patch">patch id</option>
    <option value="osm">osm id</option>
    <option value="feature">feature id</option>
  </select>
  <input id="patch-search-input" type="text"
    placeholder="e.g. patch_99868 or 99868" />
  <button id="patch-search-btn">Go</button>
  <span id="patch-search-msg"></span>
</div>
"""