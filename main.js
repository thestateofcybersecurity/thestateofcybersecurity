/* Form wiring: both forms POST to the alerts worker, which handles
 * double opt-in subscriptions and assistance-request email delivery. */

const API_BASE = 'https://alerts.cybersecurityalphabetsoup.com';

/* Cloudflare Turnstile site key. Site keys are public; the matching secret
 * lives only on the alerts worker, which verifies every token server-side.
 * The widget is shared with cybersecurityalphabetsoup.com. Set this to ''
 * to switch the check off, but only after removing the worker's secret, or
 * every submission is refused. */
const TURNSTILE_SITE_KEY = '0x4AAAAAAGTgelu-VKr5BSIY';
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function status(form, kind, message) {
  const el = form.querySelector('.form-status');
  el.textContent = message;
  el.className = `form-status ${kind}`;
}

async function post(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Try again shortly.');
  return data;
}

/* Bot check for one form. Nothing is requested from Cloudflare until the
 * visitor first touches the form, so reading the site makes no third-party
 * request on its account. Tokens are single-use: reset() after every
 * attempt asks the widget for a fresh one. */
function mountTurnstile(form) {
  let token = null;
  let widgetId;
  let started = false;
  if (!TURNSTILE_SITE_KEY) return { token: () => null, ensure() {}, reset() {} };

  function ensure() {
    if (started) return;
    started = true;
    const slot = document.createElement('div');
    slot.className = 'turnstile-slot';
    const button = form.querySelector('button[type="submit"]');
    const row = button.closest('.field-row');
    if (row) row.after(slot);
    else button.before(slot);
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.addEventListener('load', () => {
      widgetId = window.turnstile.render(slot, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (value) => { token = value; },
        'expired-callback': () => { token = null; },
        'error-callback': () => { token = null; },
      });
    });
    script.addEventListener('error', () => {
      // Blocked or offline: clear up so the next touch can try again.
      script.remove();
      slot.remove();
      started = false;
      status(form, 'err', 'The verification check could not load. Allow challenges.cloudflare.com in your browser or content blocker, then try again.');
    });
    document.head.append(script);
  }

  for (const type of ['focusin', 'pointerdown', 'input']) {
    form.addEventListener(type, ensure, { once: true, passive: true });
  }
  return {
    token: () => token,
    ensure,
    reset() {
      token = null;
      if (widgetId !== undefined && window.turnstile) window.turnstile.reset(widgetId);
    },
  };
}

function wire(formId, path, buildBody, okFallback) {
  const form = document.getElementById(formId);
  if (!form) return;
  const check = mountTurnstile(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const turnstileToken = check.token();
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      // Covers a form submitted before it was ever touched (autofill, Enter).
      check.ensure();
      status(form, 'err', 'Finish the verification check, then press the button again.');
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status(form, 'ok', 'Sending…');
    try {
      const body = buildBody(new FormData(form));
      if (turnstileToken) body.turnstileToken = turnstileToken;
      const data = await post(path, body);
      status(form, 'ok', data.message || okFallback);
      form.reset();
    } catch (error) {
      status(form, 'err', error.message);
    } finally {
      button.disabled = false;
      check.reset();
    }
  });
}

wire(
  'subscribe-form',
  '/tsoc/subscribe',
  (fd) => ({ email: fd.get('email'), website: fd.get('website') }),
  'Check your inbox to confirm your subscription.',
);

wire(
  'assist-form',
  '/tsoc/request',
  (fd) => ({
    name: fd.get('name'),
    email: fd.get('email'),
    org: fd.get('org'),
    service: fd.get('service'),
    message: fd.get('message'),
    website: fd.get('website'),
  }),
  'Request sent. I read every one and reply personally.',
);
