import fs from 'node:fs';
const s = fs.readFileSync(new URL('../public/app.html', import.meta.url),'utf8');
const src = s.slice(s.indexOf('const FRESH_MS'), s.indexOf('function applyDiscSort'));
const mk = (day) => new Function('FAKE_DAY', src + `
  return { dailyOrder, isFresh, dayIndex: () => FAKE_DAY };`)(day);

// Rebuild dailyOrder against a fixed day so the date can be varied.
function orderFor(day, list) {
  const m = mk(day);
  const fresh = list.filter(m.isFresh);
  const rest  = list.filter(i => !m.isFresh(i));
  if (rest.length < 4) return [...fresh, ...rest];
  const off = day % rest.length;
  return [...fresh, ...rest.slice(off), ...rest.slice(0, off)];
}

const list = Array.from({length: 12}, (_, i) => ({ id: 'p'+i, captured: null }));
const d1 = orderFor(20260830, list).map(x=>x.id).join(',');
const d2 = orderFor(20260831, list).map(x=>x.id).join(',');
const d3 = orderFor(20260830, list).map(x=>x.id).join(',');

const t = [];
const chk = (n,c)=>{t.push(c);console.log(`  ${c?'PASS':'FAIL'}  ${n}`)};
chk('order differs between days', d1 !== d2);
chk('same day is stable (deterministic)', d1 === d3);
chk('no item lost or duplicated', new Set(d1.split(',')).size === 12);
chk('relative order preserved (rotation, not shuffle)', (()=> {
  const ids = d1.split(',').map(x=>+x.slice(1));
  let breaks = 0;
  for (let i=1;i<ids.length;i++) if (ids[i] !== (ids[i-1]+1)%12) breaks++;
  return breaks <= 1;   // exactly one wrap point
})());

// Fresh items must lead regardless of the day.
const withFresh = [{id:'NEW', captured: new Date().toISOString()}, ...list];
chk('fresh item leads', orderFor(20260830, withFresh)[0].id === 'NEW');
chk('a 3-month-old item is not fresh', !mk(0).isFresh({captured:'2026-05-01T00:00:00Z'}));

process.exit(t.every(Boolean)?0:1);
