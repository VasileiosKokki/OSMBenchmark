"""
styles.py — Returns the CSS <style> block injected into patches_map.html.
"""
def get_css() -> str:
    return """
<style>
/* ── UI Shell ── */
  #osm-ui-shell {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    z-index: 1000;
    pointer-events: none;
    width: 360px;
  }

  /* ── Sidebar ── */
  #osm-sidebar {
    pointer-events: all;
    width: 100%;
    height: 240px;
    background: rgba(255,255,255,0.97);
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.18);
    display: none;
    flex-direction: column;
    order: 2;
  }
  #osm-sidebar-header {
    padding: 7px 10px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .04em;
    color: #555;
    border-bottom: 1px solid #e0e0e0;
    background: #f7f7f7;
    border-radius: 8px 8px 0 0;
    user-select: none;
  }
  #osm-sidebar-list {
    overflow-y: auto;
    flex: 1;
  }
  .osm-sidebar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 12px;
    border-bottom: 1px solid #f0f0f0;
    background: transparent;
  }
  .osm-sidebar-row.active {
    background: #e8f4fd;
  }
  .osm-row-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    font-weight: 400;
    color: #333;
  }
  .osm-sidebar-row.active .osm-row-label {
    font-weight: 700;
    color: #1565c0;
  }
  .osm-row-badge {
    font-size: 10px;
    color: #888;
    background: #f0f0f0;
    border-radius: 8px;
    padding: 1px 6px;
    margin-left: 6px;
    flex-shrink: 0;
  }
  .osm-row-close {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 11px;
    color: #aaa;
    padding: 0 0 0 6px;
    line-height: 1;
    flex-shrink: 0;
  }

  /* ── Detail panel ── */
  #osm-detail {
    pointer-events: all;
    width: 100%;
    max-height: 420px;
    background: rgba(255,255,255,0.97);
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.18);
    display: none;
    flex-direction: column;
    order: 1;
  }
  #osm-detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 700;
    color: #333;
    border-bottom: 1px solid #e0e0e0;
    background: #f7f7f7;
    border-radius: 8px 8px 0 0;
    user-select: none;
  }
  #osm-detail-body {
    overflow-y: auto;
    flex: 1;
    padding: 0;
  }
  #osm-detail-close {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    color: #888;
    padding: 0 2px;
    line-height: 1;
  }
  #osm-detail-close:hover { color: #333; }
  
  #patch-search {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,.15);
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: sans-serif;
    font-size: 13px;
  }
  #patch-search-input {
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 4px 8px;
    width: 220px;
    font-size: 13px;
    outline: none;
    transition: border-color .2s;
  }
  #patch-search-input:focus { border-color: #2979ff; }
  #patch-search-btn {
    padding: 4px 12px;
    cursor: pointer;
    background: #2979ff;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    transition: background .2s;
  }
  #patch-search-btn:hover { background: #1565c0; }
  #patch-search-msg { color: #e53935; font-size: 12px; }

  /* ── Per-patch floating panels ── */
  .osm-patch-panel {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 340px;
    max-height: 400px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 18px rgba(0,0,0,.18);
    font-family: sans-serif;
    font-size: 13px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: bottom .2s, right .2s;
  }
  .osm-patch-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #ddd;
    background: #f7f7f7;
    border-radius: 8px 8px 0 0;
    cursor: default;
    user-select: none;
    flex-shrink: 0;
  }
  .osm-patch-panel-header strong {
    font-size: 12px;
    color: #444;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 260px;
  }
  .osm-panel-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    color: #888;
    padding: 0 2px;
    flex-shrink: 0;
  }
  .osm-panel-close-btn:hover { color: #333; }
  .osm-patch-panel-body {
    overflow-y: auto;
    flex: 1;
  }
  .osm-summary {
    padding: 7px 12px;
    font-size: 12px;
    color: #555;
    border-bottom: 1px solid #eee;
    line-height: 1.8;
  }
  .osm-table-wrap { overflow-y: auto; }
  .osm-table { width: 100%; border-collapse: collapse; }
  .osm-table th, .osm-table td {
    padding: 5px 10px; text-align: left;
    font-size: 12px; border-bottom: 1px solid #f0f0f0;
  }
  .osm-table th {
    background: #f7f7f7; font-weight: 600;
    position: sticky; top: 0; z-index: 1;
  }
  .osm-feat-row { cursor: pointer; }
  .osm-feat-row:hover td { background: #e8f4fd !important; }
  .osm-badge {
    background: #e0e0e0; border-radius: 4px;
    padding: 1px 6px; font-size: 11px;
    margin-right: 3px; display: inline-block;
  }
  .osm-tag {
    border-radius: 3px; padding: 1px 6px;
    font-size: 11px; display: inline-block;
  }
  .osm-tag-building  { background: #e0e0e0; color: #333; }
  .osm-tag-highway   { background: #ffe0b2; color: #7a4500; }
  .osm-tag-water     { background: #bbdefb; color: #0d47a1; }
  .osm-tag-landuse   { background: #c8e6c9; color: #1b5e20; }
  .osm-tag-amenity   { background: #e1bee7; color: #4a148c; }
  .osm-tag-natural   { background: #dcedc8; color: #33691e; }
  .osm-tag-leisure   { background: #b2dfdb; color: #004d40; }
  .osm-tag-other     { background: #f5f5f5; color: #777; }
  .non-interactive-marker,
  .non-interactive-marker * {
    pointer-events: none !important;
  }
  
  #patch-search-type {{
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 13px;
    outline: none;
    cursor: pointer;
    background: #fafafa;
  }}
</style>
"""