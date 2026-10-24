/**
 * Mercado Pago sandbox experiment (plan 2026-10-24 indicacao, Task 1): does pausing a subscription (preapproval) for
 * one cycle skip exactly one charge? A daily subscription makes the cycle one day instead of one month.
 *
 * Env: MP_SANDBOX_ACCESS_TOKEN (the sandbox SELLER's access token). Never a production token.
 *
 *   npx tsx scripts/mp-pause-experiment.ts create <buyer test e-mail>   -> prints the id and the init_point to pay
 *   npx tsx scripts/mp-pause-experiment.ts status <preapproval id>      -> status, next_payment_date, its charges
 *   npx tsx scripts/mp-pause-experiment.ts pause <preapproval id>
 *   npx tsx scripts/mp-pause-experiment.ts resume <preapproval id>
 */
const API = 'https://api.mercadopago.com';

function token(): string {
  const t = process.env.MP_SANDBOX_ACCESS_TOKEN;
  if (!t) throw new Error('MP_SANDBOX_ACCESS_TOKEN não configurado');
  if (t.startsWith('APP_USR-') && !process.env.MP_SANDBOX_CONFIRMED) {
    // Sandbox test users also have APP_USR- tokens: the person running it confirms it is the test seller's
    throw new Error('Confirme que é o token do vendedor de TESTE: rode com MP_SANDBOX_CONFIRMED=1');
  }
  return t;
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MP ${res.status} ${path}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const stamp = new Date().toISOString();
  if (cmd === 'create') {
    if (!arg) throw new Error('Informe o e-mail do comprador de teste');
    const p = await call('POST', '/preapproval', {
      reason: 'Gastrux - teste de pausa (sandbox)',
      external_reference: `pause-experiment-${Date.now()}`,
      payer_email: arg,
      back_url: 'https://gastrux.com',
      status: 'pending',
      auto_recurring: { frequency: 1, frequency_type: 'days', transaction_amount: 5, currency_id: 'BRL' },
    });
    console.log(JSON.stringify({ at: stamp, id: p.id, status: p.status, init_point: p.init_point }, null, 1));
    return;
  }
  if (!arg) throw new Error('Informe o id da assinatura (preapproval)');
  if (cmd === 'status') {
    const p = await call('GET', `/preapproval/${encodeURIComponent(arg)}`);
    const charges = await call('GET', `/authorized_payments/search?preapproval_id=${encodeURIComponent(arg)}`).catch((e) => ({ error: e.message }));
    const rows = Array.isArray(charges?.results)
      ? charges.results.map((c: any) => ({ id: c.id, status: c.status, debit_date: c.debit_date, date_created: c.date_created, amount: c.transaction_amount, payment: c.payment?.status }))
      : charges;
    console.log(JSON.stringify({ at: stamp, status: p.status, next_payment_date: p.next_payment_date, summarized: p.summarized, charges: rows }, null, 1));
    return;
  }
  if (cmd === 'pause' || cmd === 'resume') {
    const p = await call('PUT', `/preapproval/${encodeURIComponent(arg)}`, { status: cmd === 'pause' ? 'paused' : 'authorized' });
    console.log(JSON.stringify({ at: stamp, status: p.status, next_payment_date: p.next_payment_date }, null, 1));
    return;
  }
  throw new Error('Comandos: create <email> | status <id> | pause <id> | resume <id>');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
