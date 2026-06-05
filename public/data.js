// ─── Canopy Data Layer ───
// The ONLY place forms touch storage. Swap MODE to move from mock → real backend.
//
//   MODE = 'mock' → saves to the browser (localStorage). Works instantly, no setup.
//   MODE = 'api'  → POSTs to /api/* serverless functions (which talk to Supabase).
//
// To go live later: create a Supabase project, fill in api/_supabase.js,
// then change MODE to 'api' below. No other code changes needed.

(function () {
  'use strict';

  const MODE = 'api'; // 'mock' | 'api'

  const KEYS = {
    waitlist: 'canopy_waitlist',
    contacts: 'canopy_contacts',
  };

  // ─── localStorage helpers ───
  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return []; }
  }
  function write(key, arr) {
    localStorage.setItem(key, JSON.stringify(arr));
  }
  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  }

  // ─── WAITLIST (Request access) ───
  async function submitWaitlist({ name, email, company }) {
    if (!email || !email.includes('@')) {
      return { ok: false, error: 'Please enter a valid email address.' };
    }

    const record = {
      id: uid(),
      name: (name || '').trim(),
      email: email.trim().toLowerCase(),
      company: (company || '').trim(),
      created_at: new Date().toISOString(),
    };

    if (MODE === 'mock') {
      const list = read(KEYS.waitlist);
      if (list.some(e => e.email === record.email)) {
        return { ok: false, error: "You're already on the list — we'll be in touch." };
      }
      list.push(record);
      write(KEYS.waitlist, list);
      return { ok: true, message: "You're on the list. We'll reach out soon." };
    }

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      const data = await res.json();
      return res.ok ? { ok: true, message: data.message } : { ok: false, error: data.error };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  }

  // ─── CONTACT (messages) ───
  async function submitContact({ name, email, company, subject, message }) {
    if (!name || !email || !message) {
      return { ok: false, error: 'Please fill in name, email, and message.' };
    }

    const record = {
      id: uid(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      company: (company || '').trim(),
      subject: subject || 'general',
      message: message.trim(),
      created_at: new Date().toISOString(),
    };

    if (MODE === 'mock') {
      const list = read(KEYS.contacts);
      list.push(record);
      write(KEYS.contacts, list);
      return { ok: true, message: "Thanks — we'll get back to you within one business day." };
    }

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      const data = await res.json();
      return res.ok ? { ok: true, message: data.message } : { ok: false, error: data.error };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  }

  // ─── READ (admin) ───
  // In 'api' mode these would fetch from /api/admin/* — left as localStorage for the mock review page.
  function getWaitlist() { return read(KEYS.waitlist).slice().reverse(); }
  function getContacts() { return read(KEYS.contacts).slice().reverse(); }
  function clearWaitlist() { write(KEYS.waitlist, []); }
  function clearContacts() { write(KEYS.contacts, []); }

  function toCSV(rows, cols) {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = cols.map(c => esc(c.label)).join(',');
    const body = rows.map(r => cols.map(c => esc(r[c.key])).join(',')).join('\n');
    return header + '\n' + body;
  }

  window.CanopyData = {
    MODE,
    submitWaitlist,
    submitContact,
    getWaitlist,
    getContacts,
    clearWaitlist,
    clearContacts,
    toCSV,
  };
})();
