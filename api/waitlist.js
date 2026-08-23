// Vercel Serverless Function — Waitlist (Request access)
// Used only when data.js MODE = 'api'. Persists to Supabase if configured,
// otherwise falls back to an in-memory list (resets on redeploy).

import { supabase } from './_supabase.js';

const memory = [];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, company } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  const record = {
    name: (name || '').trim(),
    email: email.trim().toLowerCase(),
    company: (company || '').trim(),
  };

  if (supabase) {
    const { error } = await supabase.from('waitlist').insert(record);
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: "You're already on the list." });
      console.error('[Waitlist]', error.message);
      return res.status(500).json({ error: 'Could not save. Please try again.' });
    }
  } else {
    memory.push({ ...record, created_at: new Date().toISOString() });
    console.log('[Waitlist]', JSON.stringify(record));
  }

  return res.status(200).json({ success: true, message: "You're on the list. We'll reach out soon." });
}
