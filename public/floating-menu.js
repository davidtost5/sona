/* Floating menu — a pill that morphs open, with a dark circle rising to fill it
 * and the labels rolling character by character on hover.
 *
 * Hand port of the "liquid morph floating menu", which ships as React +
 * TypeScript + Tailwind on framer-motion. This project has none of those and no
 * build step, so the animation is done with CSS transitions and a class toggle.
 * framer-motion's `animate` on width/height/borderRadius is a transition; its
 * stagger is a per-child transition-delay.
 *
 * Three accessibility gaps in the original are fixed here rather than ported:
 * the trigger was a div with a click handler (no keyboard, no role), there was
 * no aria-expanded, and Escape did not close it. A menu you cannot reach from
 * the keyboard is not a menu.
 *
 *   SonaFloatingMenu.mount(el, { items: [{ label, href }] })
 */
(function () {
  'use strict';

  var CHAR_STAGGER_MS = 30;

  function mount(root, opts) {
    var items = (opts && opts.items) || [];
    if (!root || !items.length) return null;

    var reduce = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── build ──
    root.className = 'fm';
    root.innerHTML =
      '<div class="fm-ground" aria-hidden="true"></div>' +
      '<div class="fm-circle" aria-hidden="true"></div>' +
      '<div class="fm-items" id="fm-items" role="menu"></div>' +
      '<button type="button" class="fm-bar" aria-expanded="false" aria-controls="fm-items">' +
        '<span class="fm-label">Menu</span>' +
        '<span class="fm-burger" aria-hidden="true"><i></i><i></i></span>' +
      '</button>';

    var bar = root.querySelector('.fm-bar');
    var list = root.querySelector('.fm-items');

    items.forEach(function (item, idx) {
      var a = document.createElement('a');
      a.className = 'fm-item';
      a.href = item.href || '#';
      a.setAttribute('role', 'menuitem');
      // Opening staggers the items in; framer-motion did this with a delay
      // computed per index, which is what this custom property carries.
      a.style.setProperty('--i', idx);

      // Each character is duplicated and the pair slides up by half its box, so
      // the second copy lands exactly where the first was. Per-character delay
      // is what makes it read as a roll rather than a jump.
      var label = String(item.label);
      var inner = '';
      for (var i = 0; i < label.length; i++) {
        var ch = label[i] === ' ' ? '&nbsp;' : label[i];
        inner += '<span class="fm-ch"><span class="fm-roll" style="--d:' +
                 (i * CHAR_STAGGER_MS) + 'ms">' +
                 '<b>' + ch + '</b><b aria-hidden="true">' + ch + '</b></span></span>';
      }
      // The visible text is split across spans, so the accessible name is set
      // explicitly — a screen reader would otherwise read it letter by letter.
      a.setAttribute('aria-label', label);
      a.innerHTML = inner;
      if (item.onClick) a.addEventListener('click', item.onClick);
      list.appendChild(a);
    });

    // ── open / close ──
    var open = false;

    function setOpen(next) {
      if (open === next) return;
      open = next;
      root.classList.toggle('fm-open', open);
      bar.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        // Focus the first item once it has faded in, so the ring is not drawn
        // on something still invisible.
        setTimeout(function () {
          var first = list.querySelector('.fm-item');
          if (first && open) first.focus();
        }, reduce ? 0 : 420);
      }
    }

    bar.addEventListener('click', function () { setOpen(!open); });

    document.addEventListener('click', function (e) {
      if (open && !root.contains(e.target)) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { setOpen(false); bar.focus(); return; }
      // Arrow keys move between items — the expected behaviour for role="menu",
      // and the original supported neither.
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var all = [].slice.call(list.querySelectorAll('.fm-item'));
      var at = all.indexOf(document.activeElement);
      if (at === -1) return;
      e.preventDefault();
      var next = e.key === 'ArrowDown' ? (at + 1) % all.length : (at - 1 + all.length) % all.length;
      all[next].focus();
    });

    return { open: function () { setOpen(true); }, close: function () { setOpen(false); } };
  }

  window.SonaFloatingMenu = { mount: mount };
})();
