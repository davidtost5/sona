/* Floating menu — a "Menu" pill whose links bubble up out of it on open,
 * joined by liquid bridges while they travel, then settling as separate pills.
 *
 * Port of the Gooey effect from libraries.dev (the liquid-gooey package),
 * which ships for React only. The technique is the library's own: the blobs
 * are SVG rects under a single goo filter — a blur, then an alpha threshold
 * that turns overlapping blur into one continuous shape — and the labels are
 * ordinary links laid over them with no background, so the filter never
 * touches text. Filtering SVG rather than HTML is also what keeps it working
 * in Safari. Each link and its rect get the same CSS transform and the same
 * transition, so they move in lockstep without a per-frame script.
 *
 * Kept from the previous menu, which fixed these in its own original: a real
 * button with aria-expanded, Escape to close, arrow keys between items, and
 * focus moving into the menu on open. Closed items leave the tab order.
 *
 *   SonaFloatingMenu.mount(el, { items: [{ label, href, onClick? }] })
 */
(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var BAR_W = 132, BAR_H = 48;
  var ITEM_H = 44, ITEM_MIN_W = 120;
  // With a 6px blur, pills closer than ~12px stay bridged even at rest. 14px
  // lets them part cleanly once they settle, and still reads as one column.
  var GAP = 14;
  var PAD = 12;   // room around the shapes for the goo and the drop shadow

  // The library's filter, trimmed: goo, a crisp edge, and a light top rim.
  //   blur → alpha ×18 −7   : overlapping blur becomes one shape (the goo)
  //   source atop goo       : keeps the fill colour across the bridges
  //   alpha ×60 −29.5       : re-sharpens the soft edge the blur left
  //   1px band from offset  : a thin highlight along each top edge
  var FILTER =
    '<feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>' +
    '<feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/>' +
    '<feComposite in="SourceGraphic" in2="goo" operator="atop" result="shape"/>' +
    '<feColorMatrix in="shape" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 60 -29.5" result="bin"/>' +
    '<feOffset in="bin" dx="0" dy="1" result="shifted"/>' +
    '<feComposite in="bin" in2="shifted" operator="out" result="edge"/>' +
    '<feFlood flood-color="rgba(255,255,255,0.28)" result="tint"/>' +
    '<feComposite in="tint" in2="edge" operator="in" result="rim"/>' +
    '<feMerge><feMergeNode in="bin"/><feMergeNode in="rim"/></feMerge>';

  function rect(node, x, y, w, h) {
    node.setAttribute('x', x); node.setAttribute('y', y);
    node.setAttribute('width', w); node.setAttribute('height', h);
    node.setAttribute('rx', h / 2);
  }
  function box(node, x, y, w, h) {
    node.style.left = x + 'px'; node.style.top = y + 'px';
    node.style.width = w + 'px'; node.style.height = h + 'px';
  }

  function mount(root, opts) {
    var items = (opts && opts.items) || [];
    if (!root || !items.length) return null;

    var reduce = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var n = items.length;

    // ── build ──
    root.className = 'gm';
    root.style.setProperty('--n', n);
    root.innerHTML = '';

    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'gm-goo');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML =
      '<defs><filter id="gm-goo" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">' +
      FILTER + '</filter></defs><g filter="url(#gm-goo)"></g>';
    var filter = svg.querySelector('filter');
    var goo = svg.querySelector('g');

    var list = document.createElement('div');
    list.className = 'gm-items';
    list.id = 'gm-items';
    list.setAttribute('role', 'menu');
    list.setAttribute('aria-label', 'Menu');

    var bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'gm-bar';
    bar.setAttribute('aria-expanded', 'false');
    bar.setAttribute('aria-controls', 'gm-items');
    bar.innerHTML = '<span>Menu</span><span class="gm-burger" aria-hidden="true"><i></i><i></i></span>';

    var links = [], shapes = [];
    items.forEach(function (item, idx) {
      // k counts outward from the Menu pill: the last item sits nearest it,
      // comes out first and goes back last. DOM order stays top to bottom,
      // matching what is on screen.
      var k = n - 1 - idx;

      var a = document.createElement('a');
      a.className = 'gm-item';
      a.href = item.href || '#';
      a.setAttribute('role', 'menuitem');
      a.style.setProperty('--k', k);
      var label = document.createElement('span');
      label.textContent = String(item.label);
      a.appendChild(label);
      if (item.onClick) a.addEventListener('click', item.onClick);

      var r = document.createElementNS(SVGNS, 'rect');
      r.setAttribute('class', 'gm-shape gm-shape-item');
      r.style.setProperty('--k', k);

      // The link has no background, so its hover and focus show on its blob.
      var hot = function () { r.classList.add('is-hot'); };
      var cold = function () { r.classList.remove('is-hot'); };
      a.addEventListener('mouseenter', hot); a.addEventListener('focus', hot);
      a.addEventListener('mouseleave', cold); a.addEventListener('blur', cold);

      list.appendChild(a); goo.appendChild(r);
      links.push(a); shapes.push(r);
    });

    var barShape = document.createElementNS(SVGNS, 'rect');
    barShape.setAttribute('class', 'gm-shape gm-shape-bar');
    goo.appendChild(barShape);

    root.appendChild(svg);
    root.appendChild(list);
    root.appendChild(bar);

    // ── layout ──
    // Every pill in the column shares the widest label's width. Measured, not
    // fixed, so the labels passed in decide it; re-run once web fonts land.
    function layout() {
      var w = ITEM_MIN_W;
      links.forEach(function (a) { a.style.width = ''; w = Math.max(w, Math.ceil(a.offsetWidth)); });

      var W = Math.max(BAR_W, w) + PAD * 2;
      var H = PAD + n * (ITEM_H + GAP) + BAR_H + PAD;
      root.style.width = W + 'px';
      root.style.height = H + 'px';
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      filter.setAttribute('x', -PAD); filter.setAttribute('y', -PAD);
      filter.setAttribute('width', W + PAD * 2); filter.setAttribute('height', H + PAD * 2);

      var cx = W / 2;
      var barY = H - PAD - BAR_H;
      box(bar, cx - BAR_W / 2, barY, BAR_W, BAR_H);
      rect(barShape, cx - BAR_W / 2, barY, BAR_W, BAR_H);

      links.forEach(function (a, idx) {
        var k = n - 1 - idx;
        var y = barY - GAP - ITEM_H - k * (ITEM_H + GAP);
        box(a, cx - w / 2, y, w, ITEM_H);
        rect(shapes[idx], cx - w / 2, y, w, ITEM_H);
        // Closed, each pill sits shrunk at the Menu pill's centre; --dy is
        // the trip back there from where it rests when open.
        var dy = (barY + BAR_H / 2) - (y + ITEM_H / 2);
        a.style.setProperty('--dy', dy + 'px');
        shapes[idx].style.setProperty('--dy', dy + 'px');
      });
    }
    layout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

    // ── open / close ──
    var open = false;

    function setOpen(next) {
      if (open === next) return;
      open = next;
      root.classList.toggle('gm-open', open);
      bar.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        // Focus the top item once the column has sprung out, so the ring is
        // not drawn on something still in flight.
        setTimeout(function () {
          if (open && links[0]) links[0].focus();
        }, reduce ? 0 : 320);
      } else {
        shapes.forEach(function (r) { r.classList.remove('is-hot'); });
      }
    }

    bar.addEventListener('click', function () { setOpen(!open); });

    // Following a link closes the menu; an in-page anchor would otherwise
    // leave it open over the section it just scrolled to.
    list.addEventListener('click', function (e) {
      if (e.target.closest('.gm-item')) setOpen(false);
    });

    document.addEventListener('click', function (e) {
      if (open && !root.contains(e.target)) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { setOpen(false); bar.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var at = links.indexOf(document.activeElement);
      if (at === -1) return;
      e.preventDefault();
      var nxt = e.key === 'ArrowDown' ? (at + 1) % n : (at - 1 + n) % n;
      links[nxt].focus();
    });

    return { open: function () { setOpen(true); }, close: function () { setOpen(false); } };
  }

  window.SonaFloatingMenu = { mount: mount };
})();
