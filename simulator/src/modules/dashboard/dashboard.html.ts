import { env } from '../../config/env';

export function dashboardHtml(): string {
  const controlToken = env.SIMULATOR_CONTROL_TOKEN;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BillingHub payment simulator</title>
    <style>
      :root {
        --ink: #1c1917;
        --muted: #57534e;
        --paper: #f5f0e8;
        --panel: #fffdf8;
        --line: #d6d3d1;
        --warn: #9a3412;
        --warn-bg: #fed7aa;
        --ok: #166534;
        --bad: #991b1b;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        background: repeating-linear-gradient(
          -45deg,
          #f5f0e8,
          #f5f0e8 12px,
          #efe8db 12px,
          #efe8db 24px
        );
        color: var(--ink);
      }
      .banner {
        position: sticky;
        top: 0;
        z-index: 10;
        background: #9a3412;
        color: #fff7ed;
        padding: 0.85rem 1.25rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border-bottom: 4px solid #431407;
      }
      main { padding: 1.25rem; max-width: 1200px; margin: 0 auto; }
      h1 { font-size: 1.35rem; margin: 0 0 0.35rem; }
      .lede { color: var(--muted); margin: 0 0 1rem; max-width: 46rem; }
      .grid { display: grid; gap: 1rem; }
      @media (min-width: 900px) {
        .grid.two { grid-template-columns: 1fr 1fr; }
      }
      section {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 1rem;
      }
      h2 { margin: 0 0 0.75rem; font-size: 1rem; }
      .controls { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
      button {
        border: 1px solid #44403c;
        background: #fff;
        padding: 0.4rem 0.7rem;
        border-radius: 4px;
        cursor: pointer;
        font: inherit;
      }
      button:hover { background: var(--warn-bg); }
      table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      th, td { text-align: left; padding: 0.4rem 0.35rem; border-bottom: 1px solid var(--line); vertical-align: top; }
      .empty, .error, .ok { padding: 0.5rem 0; }
      .error { color: var(--bad); }
      .ok { color: var(--ok); }
      .tag {
        display: inline-block;
        padding: 0.1rem 0.4rem;
        border-radius: 999px;
        background: #e7e5e4;
        font-size: 0.75rem;
      }
      .tag.succeeded, .tag.paid, .tag.delivered, .tag.success, .tag.active { background: #dcfce7; color: var(--ok); }
      .tag.declined, .tag.failed, .tag.void, .tag.canceled, .tag.forced_fail { background: #fee2e2; color: var(--bad); }
      .tag.insufficient_funds, .tag.pending { background: #ffedd5; color: var(--warn); }
      .mono { font-family: ui-monospace, Consolas, monospace; font-size: 0.78rem; }
      .test-note { font-size: 0.8rem; color: var(--muted); margin: 0 0 0.75rem; }
    </style>
  </head>
  <body>
    <div class="banner">SIMULATOR — no real money</div>
    <main>
      <h1>Payment simulator dashboard</h1>
      <p class="lede">
        This is a labelled test harness for BillingHub. It never processes real
        money, never stores card numbers, and only accepts simulator tokens.
      </p>
      <p id="flash" class="ok" hidden></p>
      <p id="flash-error" class="error" hidden></p>
      <div class="grid two">
        <section>
          <h2>Test payments</h2>
          <p class="test-note">Creates a throwaway simulated customer plus one payment. Tokens: tok_sim_visa_ok, tok_sim_declined, tok_sim_insufficient_funds.</p>
          <div class="controls">
            <button data-token="tok_sim_visa_ok">Successful test payment</button>
            <button data-token="tok_sim_declined">Declined test payment</button>
            <button data-token="tok_sim_insufficient_funds">Insufficient-funds payment</button>
          </div>
          <h2>Webhook controls</h2>
          <p class="test-note">Replay and duplicate keep the original event id. Fail-next forces the next delivery attempt to fail, then retries.</p>
          <div class="controls">
            <button id="fail-next">Force next webhook to fail</button>
          </div>
          <div id="payments-panel"></div>
        </section>
        <section>
          <h2>Subscriptions and invoices</h2>
          <div id="subs-panel"></div>
        </section>
        <section style="grid-column: 1 / -1">
          <h2>Webhook events</h2>
          <div id="events-panel"></div>
        </section>
      </div>
    </main>
    <script>
      const CONTROL_TOKEN = ${JSON.stringify(controlToken)};
      const flash = document.getElementById('flash');
      const flashError = document.getElementById('flash-error');

      function showOk(message) {
        flash.hidden = false;
        flashError.hidden = true;
        flash.textContent = message;
      }
      function showErr(message) {
        flash.hidden = true;
        flashError.hidden = false;
        flashError.textContent = message;
      }
      function money(amount, currency) {
        return (amount / 100).toFixed(2) + ' ' + currency + ' (minor units: ' + amount + ')';
      }
      function tag(value) {
        return '<span class="tag ' + value + '">' + value + '</span>';
      }
      function empty(label) {
        return '<p class="empty">No ' + label + ' yet. This is simulated test data only.</p>';
      }

      async function loadOverview() {
        const res = await fetch('/sim/overview');
        if (!res.ok) throw new Error('Could not load simulator overview');
        return res.json();
      }

      function renderPayments(data) {
        const root = document.getElementById('payments-panel');
        if (!data.payments.length) {
          root.innerHTML = empty('payments');
          return;
        }
        root.innerHTML = '<table><thead><tr><th>Status</th><th>Amount</th><th>Customer</th><th>Created</th></tr></thead><tbody>' +
          data.payments.map((p) => '<tr><td>' + tag(p.status) + '</td><td class="mono">' + money(p.amount, p.currency) + '</td><td>' + p.customerName + '<br><span class="mono">' + p.customerEmail + '</span></td><td class="mono">' + p.createdAt + '</td></tr>').join('') +
          '</tbody></table>';
      }

      function renderSubs(data) {
        const root = document.getElementById('subs-panel');
        const subs = data.subscriptions.length
          ? '<table><thead><tr><th>Status</th><th>Amount</th><th>Customer</th></tr></thead><tbody>' +
            data.subscriptions.map((s) => '<tr><td>' + tag(s.status) + '</td><td class="mono">' + money(s.amount, s.currency) + '</td><td class="mono">' + s.customerEmail + '</td></tr>').join('') +
            '</tbody></table>'
          : empty('subscriptions');
        const invoices = data.invoices.length
          ? '<table><thead><tr><th>Invoice</th><th>Status</th><th>Amount</th></tr></thead><tbody>' +
            data.invoices.map((i) => '<tr><td class="mono">' + i.id.slice(0, 8) + '</td><td>' + tag(i.status) + '</td><td class="mono">' + money(i.amount, i.currency) + '</td></tr>').join('') +
            '</tbody></table>'
          : empty('invoices');
        root.innerHTML = subs + invoices;
      }

      function renderEvents(data) {
        const root = document.getElementById('events-panel');
        if (!data.events.length) {
          root.innerHTML = empty('webhook events');
          return;
        }
        root.innerHTML = '<table><thead><tr><th>Event</th><th>Delivery</th><th>Attempts</th><th>Last response</th><th></th></tr></thead><tbody>' +
          data.events.map((e) => {
            const last = e.lastDelivery;
            const response = last
              ? (last.httpStatus ?? '') + ' ' + (last.responseBody ?? last.status)
              : 'not attempted';
            return '<tr><td><span class="mono">' + e.type + '</span><br><span class="mono">' + e.id + '</span></td><td>' + tag(e.status) + (last ? ' / ' + tag(last.reason) : '') + '</td><td>' + e.attempts + ' auto / ' + e.deliveryCount + ' recorded</td><td class="mono">' + response + '</td><td><button data-replay="' + e.id + '">Replay</button> <button data-duplicate="' + e.id + '">Duplicate</button></td></tr>';
          }).join('') +
          '</tbody></table>';
      }

      async function refresh() {
        try {
          const data = await loadOverview();
          renderPayments(data);
          renderSubs(data);
          renderEvents(data);
        } catch (err) {
          showErr(err instanceof Error ? err.message : 'Load failed');
        }
      }

      async function postControl(path, body) {
        const res = await fetch(path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Simulator-Control-Token': CONTROL_TOKEN,
          },
          body: JSON.stringify(body ?? {}),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error?.message || 'Request failed');
        }
        return payload;
      }

      document.querySelectorAll('[data-token]').forEach((button) => {
        button.addEventListener('click', async () => {
          const token = button.getAttribute('data-token');
          if (!confirm('Create a simulated test payment with ' + token + '? No real money is used.')) return;
          try {
            const result = await postControl('/sim/test-payments', { token });
            showOk('Created test payment ' + result.payment.id + ' (' + result.payment.status + ')');
            await refresh();
          } catch (err) {
            showErr(err instanceof Error ? err.message : 'Payment failed');
          }
        });
      });

      document.getElementById('fail-next').addEventListener('click', async () => {
        if (!confirm('Force the next webhook delivery to fail? The payment record stays unchanged.')) return;
        try {
          await postControl('/sim/events/fail-next', {});
          showOk('Next webhook delivery will fail on purpose.');
        } catch (err) {
          showErr(err instanceof Error ? err.message : 'fail-next failed');
        }
      });

      document.getElementById('events-panel').addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const replayId = target.getAttribute('data-replay');
        const duplicateId = target.getAttribute('data-duplicate');
        if (replayId) {
          if (!confirm('Replay event ' + replayId + ' with the same event id?')) return;
          try {
            await postControl('/sim/events/replay', { eventId: replayId });
            showOk('Replayed event ' + replayId);
            await refresh();
          } catch (err) {
            showErr(err instanceof Error ? err.message : 'Replay failed');
          }
        }
        if (duplicateId) {
          if (!confirm('Send a duplicate delivery of event ' + duplicateId + '?')) return;
          try {
            await postControl('/sim/events/duplicate', { eventId: duplicateId });
            showOk('Duplicate delivery sent for ' + duplicateId);
            await refresh();
          } catch (err) {
            showErr(err instanceof Error ? err.message : 'Duplicate failed');
          }
        }
      });

      refresh();
      setInterval(refresh, 4000);
    </script>
  </body>
</html>`;
}
