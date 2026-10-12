/* Sona — homepage loading animation.
 *
 * Adapted from Osmo's "Willem" loader: the letters of "Sona" rise, a box opens
 * between "So" and "na", flicks through three frames (Find, Decode, Write),
 * lands on the green brand frame, grows to fill the screen, then lifts away
 * like a curtain while the hero rises in underneath.
 *
 * Whether it plays is decided by the inline script in <head>, before first
 * paint, so the hero never flashes first: it adds `sona-loading` to <html>
 * once per session, and never for prefers-reduced-motion. This file only runs
 * the timeline when that class is present. A click or Esc skips to the end.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var loader = document.querySelector('.sona-loader');

  function finish() {
    root.classList.remove('sona-loading');
    if (loader) loader.remove();
  }

  if (!loader || !root.classList.contains('sona-loading')) { finish(); return; }
  // GSAP failed to load: show the page rather than a frozen loader.
  if (!window.gsap) { finish(); return; }

  clearTimeout(window.__sonaLoaderFailsafe);
  try { window.sessionStorage.setItem('sona_loader_seen', '1'); } catch (_) {}

  var q = function (sel) { return loader.querySelectorAll(sel); };
  var letters = q('.sl-letter');
  var box = q('.sl-box');
  var grow = q('.sl-grow');
  var start = q('.sl-start');
  var end = q('.sl-end');
  var extras = q('.sl-extra');

  // The hero has already revealed itself under the loader; it replays its
  // entrance as the curtain lifts. CSS transitions on the same properties
  // would fight GSAP's per-frame writes, so they are off for the tween.
  var hero = document.querySelectorAll('.hero [data-r]');
  hero.forEach(function (el) { el.classList.add('in'); });

  var tl = gsap.timeline({
    defaults: { ease: 'expo.inOut' },
    onComplete: finish,
  });

  tl.from(letters, { yPercent: 100, stagger: 0.025, duration: 1.25 });

  // Open the box between "So" and "na", nudging the halves apart.
  tl.fromTo(box, { width: '0em' }, { width: '1em', duration: 1.25 }, '< 1.25');
  tl.fromTo(grow, { width: '0%' }, { width: '100%', duration: 1.25 }, '<');
  tl.fromTo(start, { x: '0em' }, { x: '-0.05em', duration: 1.25 }, '<');
  tl.fromTo(end, { x: '0em' }, { x: '0.05em', duration: 1.25 }, '<');

  // Flick through Find → Decode → Write, landing on the green frame.
  tl.fromTo(extras, { opacity: 1 }, { opacity: 0, duration: 0.05, ease: 'none', stagger: 0.5 }, '-=0.05');

  // Green frame fills the screen. Slightly over 100% because the box sits on
  // the word's centre, not the viewport's, which left a hairline at one edge.
  tl.to(grow, { width: '104vw', height: '104dvh', duration: 2 }, '< 1.25');
  tl.to(box, { width: '110vw', duration: 2 }, '<');

  // Curtain up, hero rises in behind it.
  tl.to(loader, { yPercent: -100, duration: 1.2 }, '< 1.6');
  if (hero.length) {
    tl.fromTo(hero,
      { y: 60, opacity: 0, transition: 'none' },
      { y: 0, opacity: 1, duration: 1.25, ease: 'expo.out', stagger: 0.06,
        clearProps: 'transform,opacity,transition' },
      '< 0.45');
  }

  function skip() { tl.progress(1); }
  loader.addEventListener('click', skip);
  document.addEventListener('keydown', function onKey(e) {
    if (e.key !== 'Escape') return;
    document.removeEventListener('keydown', onKey);
    skip();
  });
})();
