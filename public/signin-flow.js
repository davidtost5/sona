/* Sona's sign-in flow: email, then a 6-digit code. One path for everybody.
 *
 * Built on Clerk's documented custom-flow API, so the page draws its own form.
 * An address with an account signs in; any other address creates one. No name,
 * no password. Those are Clerk settings on the production instance
 * (password off, email code on); `missing_requirements` below is what happens
 * if someone turns a required field back on.
 *
 * The page needs <div id="clerk-captcha"> in the DOM for Clerk's bot check.
 */
(function (root) {
  'use strict';

  var MESSAGES = {
    form_param_format_invalid: 'That doesn’t look like an email address. Check it and try again.',
    form_identifier_invalid: 'That doesn’t look like an email address. Check it and try again.',
    form_code_incorrect: 'That code isn’t right. Check it and try again.',
    verification_expired: 'That code has expired. Send a new one below.',
    verification_failed: 'Too many tries with that code. Send a new one below.',
    too_many_requests: 'Too many tries. Wait a minute, then try again.',
    captcha_invalid: 'We couldn’t confirm you’re human. Reload the page and try again.',
    captcha_unavailable: 'We couldn’t confirm you’re human. Reload the page and try again.',
    missing_requirements: 'We couldn’t finish creating your account. Email david@buildwithsona.com and we’ll sort it out.',
    no_email_code: 'This account can’t use an email code. Email david@buildwithsona.com and we’ll sort it out.',
    incomplete: 'We couldn’t finish signing you in. Email david@buildwithsona.com and we’ll sort it out.',
  };
  var FALLBACK = 'Something went wrong on our side. Try again in a minute.';

  function codeOf(err) {
    return (err && err.errors && err.errors[0] && err.errors[0].code) || (err && err.code) || '';
  }

  function messageFor(err) {
    var code = codeOf(err);
    if (code.indexOf('too_many') === 0) return MESSAGES.too_many_requests;
    return MESSAGES[code] || FALLBACK;
  }

  function fail(code) {
    var e = new Error(code);
    e.code = code;
    return e;
  }

  function createFlow(clerk) {
    var mode = null;     // 'in' or 'up'
    var attempt = null;  // the Clerk sign-in or sign-up in progress
    var factor = null;   // the sign-in's email_code factor

    async function beginSignIn(email) {
      var si = await clerk.client.signIn.create({ identifier: email });
      var f = (si.supportedFirstFactors || []).find(function (x) { return x.strategy === 'email_code'; });
      if (!f) throw fail('no_email_code');
      attempt = await si.prepareFirstFactor({ strategy: 'email_code', emailAddressId: f.emailAddressId });
      factor = f;
      mode = 'in';
    }

    async function beginSignUp(email) {
      var su = await clerk.client.signUp.create({ emailAddress: email });
      attempt = await su.prepareEmailAddressVerification({ strategy: 'email_code' });
      factor = null;
      mode = 'up';
    }

    return {
      get mode() { return mode; },

      // Sends the code. Resolves 'in' or 'up'.
      start: async function (email) {
        try {
          await beginSignIn(email);
        } catch (e) {
          if (codeOf(e) !== 'form_identifier_not_found') throw e;
          try {
            await beginSignUp(email);
          } catch (e2) {
            // The account appeared between the two calls (a second tab).
            if (codeOf(e2) !== 'form_identifier_exists') throw e2;
            await beginSignIn(email);
          }
        }
        return mode;
      },

      resend: async function () {
        if (mode === 'in') {
          attempt = await attempt.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
        } else {
          attempt = await attempt.prepareEmailAddressVerification({ strategy: 'email_code' });
        }
      },

      // Checks the code and starts the session.
      verify: async function (code) {
        var res = mode === 'in'
          ? await attempt.attemptFirstFactor({ strategy: 'email_code', code: code })
          : await attempt.attemptEmailAddressVerification({ code: code });
        attempt = res;
        if (res.status !== 'complete') {
          throw fail(res.status === 'missing_requirements' ? 'missing_requirements' : 'incomplete');
        }
        await clerk.setActive({ session: res.createdSessionId });
      },
    };
  }

  root.SonaSignin = { createFlow: createFlow, messageFor: messageFor, codeOf: codeOf };
})(typeof window !== 'undefined' ? window : globalThis);
