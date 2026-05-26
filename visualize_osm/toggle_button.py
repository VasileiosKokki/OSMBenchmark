"""
toggle_button.py — Self-contained backend toggle button: HTML, CSS, and JS.
Keeps all toggle concerns out of js_logic.py and styles.py.
"""
from config import BACKEND_LIST, BACKEND_COLORS, DEFAULT_BACKEND


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
    border: 1px solid #ccc;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,.15);
    font-family: sans-serif;
    font-size: 13px;
  }}
  .bt-seg {{
    padding: 7px 14px;
    cursor: pointer;
    background: #fff;
    border: none;
    border-right: 1px solid #ccc;
    color: #aaa;
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


def get_toggle_js(map_var: str) -> str:
    return f"""
<script id="toggle-js">
(function() {{
  var toggle = document.getElementById('backend-toggle');
  var locked = false;

  var initBtn = document.getElementById('bt-' + activeBackend);
  if (initBtn) initBtn.classList.add('bt-active');

  var initGroup = window[DEFAULT_GROUP_VAR];
  if (initGroup) initGroup.addTo({map_var});

  toggle.addEventListener('click', function(e) {{
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
  }});
}})();
</script>
"""