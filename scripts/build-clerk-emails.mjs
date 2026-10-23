/* Build the Clerk account emails from the same layout as Sona's own email.
 *
 * Clerk sends sign-in and password emails itself, so these are pasted into
 * Clerk → Configure → Emails → <template> → HTML mode. {{otp_code}} is where
 * Clerk puts the code: before saving, check it against the variable picker
 * in Clerk's editor and use Clerk's name if it differs.
 *
 *   node scripts/build-clerk-emails.mjs   → email-templates/clerk/*.html
 */
import { writeFileSync } from 'node:fs';
import { brandEmail } from '../api/_email-templates.js';

const CODE = '{{otp_code}}';
const templates = {
  'verification-code': brandEmail({
    subject: 'Your Sona sign-in code',
    preheader: 'Enter this code to finish signing in.',
    tags: ['Sign-in', 'Code'],
    title: ['Your Sona', 'sign-in code'],
    greeting: 'Hi,',
    paragraphs: ['Enter this code in Sona to finish signing in. It works once and expires soon.'],
    code: CODE,
    note: "Didn't try to sign in? You can ignore this email. Nobody can get into your account without this code.",
    primary: { label: 'Open Sona', href: 'https://buildwithsona.com/app' },
  }),
  'reset-password-code': brandEmail({
    subject: 'Reset your Sona password',
    preheader: 'Enter this code to choose a new password.',
    tags: ['Password', 'Reset'],
    title: ['Reset your', 'password'],
    greeting: 'Hi,',
    paragraphs: ['Enter this code in Sona to choose a new password.'],
    code: CODE,
    note: "Didn't ask to reset your password? Ignore this email and your password stays the same.",
    primary: { label: 'Open Sona', href: 'https://buildwithsona.com/app' },
  }),
};

for (const [name, mail] of Object.entries(templates)) {
  const path = new URL(`../email-templates/clerk/${name}.html`, import.meta.url);
  writeFileSync(path, mail.html);
  console.log('wrote', path.pathname, `(subject: ${mail.subject})`);
}
