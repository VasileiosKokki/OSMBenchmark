"""ui_fragments.py - Small HTML, CSS, and JS fragments injected into the map page."""
from config import BACKEND_LIST, BACKEND_COLORS


def static_html() -> str:
    return """
<div id="patch-search">
  <select id="patch-search-type">
    <option value="osm">osm id</option>
    <option value="patch">patch id</option>
    <option value="feature">feature id</option>
  </select>
  <input id="patch-search-input" type="text"
    placeholder="e.g. 242" />
  <button id="patch-search-btn">Go</button>
  <span id="patch-search-msg"></span>
</div>
<div id="fps-counter">
  <div id="fps-counter-rate">-- fps</div>
</div>
"""


def get_toggle_html() -> str:
    segments = ''.join(
        f'<button id="bt-{name}" class="bt-seg" data-backend="{name}">{name}</button>'
        for name in BACKEND_LIST
    )
    return f'<div id="backend-toggle">{segments}</div>'


def get_toggle_css() -> str:
    active_rules = ''.join(
        f'#bt-{name}.bt-active {{ background: {BACKEND_COLORS[name]}; }}\n'
        for name in BACKEND_LIST
    )
    return f"""
<style id="toggle-css">
  #backend-toggle {{
    position: fixed;
    top: 16px;
    right: 60px;
    z-index: 9999;
    display: flex;
    border: 1px solid #2b303a;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 10px 28px rgba(0,0,0,.42);
    font-family: sans-serif;
    font-size: 13px;
  }}
  .bt-seg {{
    padding: 7px 14px;
    cursor: pointer;
    background: rgba(8, 10, 14, 0.94);
    border: none;
    border-right: 1px solid #2b303a;
    color: #9aa3af;
    font-size: 13px;
    font-family: sans-serif;
    transition: none;
  }}
  .bt-seg:last-child {{ border-right: none; }}
  .bt-seg.bt-active {{
    color: #fff;
    font-weight: 600;
  }}
  {active_rules}
</style>
"""


def get_toggle_js() -> str:
    return """
<script id="toggle-js">
(function() {
  var toggle = document.getElementById('backend-toggle');
  var locked = false;

  var initBtn = document.getElementById('bt-' + activeBackend);
  if (initBtn) initBtn.classList.add('bt-active');

  toggle.addEventListener('click', function(e) {
    if (locked) return;
    var btn = e.target.closest('[data-backend]');
    if (!btn) return;
    e.stopPropagation();
    var newBackend = btn.dataset.backend;
    if (newBackend === activeBackend) return;
    locked = true;
    toggle.style.pointerEvents = 'none';
    var prev = toggle.querySelector('.bt-active');
    if (prev) prev.classList.remove('bt-active');
    btn.classList.add('bt-active');
    selectBackend(newBackend);
    locked = false;
    toggle.style.pointerEvents = '';
  });
})();
</script>
"""
