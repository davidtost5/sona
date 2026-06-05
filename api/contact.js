// Vercel Serverless Function — Contact Form Handler
// Persists to Supabase if configured; otherwise falls back to in-memory (resets on redeploy).

import { supabase } from './_supabase.js';

const memory = [];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, company, subject, message } = req.body || {};

  // Validation
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const record = {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    company: (company || '').trim(),
    subject: subject || 'general',
    message: message.trim(),
  };

  if (supabase) {
    const { error } = await supabase.from('contacts').insert(record);
    if (error) {
      console.error('[Contact]', error.message);
      return res.status(500).json({ error: 'Could not send your message. Please try again.' });
    }
  } else {
    memory.push({ ...record, created_at: new Date().toISOString() });
    console.log('[Contact Form]', JSON.stringify(record));
  }

  return res.status(200).json({
    success: true,
    message: "Thank you! We'll be in touch within 24 hours.",
  });
}
