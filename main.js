/* Form wiring: both forms POST to the alerts worker, which handles
 * double opt-in subscriptions and assistance-request email delivery. */

const API_BASE = 'https://alerts.cybersecurityalphabetsoup.com';

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

function wire(formId, path, buildBody, okFallback) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status(form, 'ok', 'Sending…');
    try {
      const data = await post(path, buildBody(new FormData(form)));
      status(form, 'ok', data.message || okFallback);
      form.reset();
    } catch (error) {
      status(form, 'err', error.message);
    } finally {
      button.disabled = false;
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
