import type { Metadata } from 'next';
import Link from 'next/link';
import { EXAMPLE_ORDER } from '@/lib/delivery-orders/example';

export const metadata: Metadata = {
  title: 'API de pedidos | Gastrux para desenvolvedores',
  description: 'Como mandar pedidos de delivery do seu site, bot ou sistema para um restaurante no Gastrux.',
};

const example = JSON.stringify(EXAMPLE_ORDER, null, 2);
const curl = `curl -X POST https://gastrux.com/api/v1/pedidos \\
  -H "Authorization: Bearer gx_live_SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(EXAMPLE_ORDER)}'`;
const verify = `import crypto from 'crypto';

// body: o texto cru recebido; secret: o "segredo da assinatura" da chave
export function avisoValido(body, assinatura, secret) {
  const esperado = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(esperado), b = Buffer.from(assinatura || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`;

const FIELDS: Array<[string, string]> = [
  ['codigo', 'Obrigatório. O código do pedido no seu sistema. Mandar o mesmo código de novo não duplica o pedido.'],
  ['cliente.nome, cliente.celular', 'Obrigatórios. Celular com DDD. O cliente entra no CRM do restaurante e ganha cashback, se o restaurante usa.'],
  ['cliente.email', 'Opcional.'],
  ['retirada', 'true quando o cliente busca no restaurante. Sem retirada, entrega.endereco é obrigatório.'],
  ['entrega', 'endereco (obrigatório na entrega), numero, complemento, bairro, cidade, cep, referencia.'],
  ['itens[]', 'De 1 a 100. nome, quantidade (1 a 99), precoUnitario; codigo (o "Código do produto" do cardápio do Gastrux), adicionais [{ nome, preco }] e observacao são opcionais.'],
  ['taxaEntrega, desconto', 'Em reais. Opcionais (zero quando não vêm).'],
  ['total', 'Obrigatório. Precisa fechar com itens + adicionais + taxa de entrega − desconto (diferença de até R$ 0,01).'],
  ['pagamento', 'forma: PIX, CREDITO, DEBITO, DINHEIRO, VALE_REFEICAO ou OUTRO; pago: true ou false; trocoPara (opcional, no dinheiro).'],
  ['agendadoPara', 'Opcional. Data e hora ISO, como 2026-10-24T19:30:00-03:00, em até 30 dias.'],
  ['observacao', 'Opcional, até 500 letras.'],
];

const STATUS: Array<[string, string]> = [
  ['aguardando_aceite', 'O restaurante exige o "Aceitar" e ainda não aceitou.'],
  ['aceito', 'Aceito: foi para a cozinha.'],
  ['em_preparo', 'A cozinha começou.'],
  ['pronto', 'Pronto para entregar ou retirar.'],
  ['saiu_para_entrega', 'Saiu para entrega.'],
  ['entregue', 'Entregue ou retirado: venda concluída.'],
  ['cancelado', 'Recusado ou cancelado pelo restaurante.'],
];

const Code = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100"><code>{children}</code></pre>
);

/** Public docs of the Gastrux order API (plan 2026-10-23 api-de-pedidos, Task 8) */
export default function DevelopersPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 text-slate-800">
      <header className="space-y-2">
        <p className="text-sm font-medium text-orange-600">Gastrux para desenvolvedores</p>
        <h1 className="text-3xl font-bold">API de pedidos</h1>
        <p>
          Mande pedidos de delivery do seu site, bot de WhatsApp ou sistema direto para um restaurante no Gastrux. O
          pedido aparece em Pedidos de delivery, vai para a cozinha e entra no caixa e nos relatórios do restaurante.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">1. Peça a chave ao restaurante</h2>
        <p>
          O dono ou o gerente cria a chave em <strong>Configurações &gt; API de pedidos</strong> (planos Pro e Business). A
          chave começa com <code>gx_live_</code> e aparece uma vez só. Cada chave vale para um restaurante.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">2. Mande o pedido</h2>
        <p><code>POST https://gastrux.com/api/v1/pedidos</code> com <code>Authorization: Bearer gx_live_...</code> e o pedido em JSON (até 256 KB).</p>
        <Code>{example}</Code>
        <Code>{curl}</Code>
        <p>
          Resposta <code>201</code> no pedido novo e <code>200</code>, com o mesmo corpo, quando o mesmo <code>codigo</code>
          chega de novo: <code>{'{ "id", "codigo", "status", "aceito" }'}</code>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Campos</h2>
        <table className="w-full text-sm">
          <tbody>
            {FIELDS.map(([f, d]) => (
              <tr key={f} className="border-t align-top"><td className="py-2 pr-4 font-mono text-xs">{f}</td><td className="py-2">{d}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">3. Acompanhe o pedido</h2>
        <p><code>GET https://gastrux.com/api/v1/pedidos/&lt;codigo&gt;</code> com a mesma chave responde <code>{'{ "codigo", "status", "atualizadoEm" }'}</code>.</p>
        <table className="w-full text-sm">
          <tbody>
            {STATUS.map(([s, d]) => (
              <tr key={s} className="border-t"><td className="py-2 pr-4 font-mono text-xs">{s}</td><td className="py-2">{d}</td></tr>
            ))}
          </tbody>
        </table>
        <p>
          Ou receba cada mudança: o restaurante cadastra um endereço <code>https</code> na chave, e o Gastrux manda um
          <code> POST</code> com <code>{'{ "codigo", "status", "atualizadoEm" }'}</code> e o cabeçalho
          <code> x-gastrux-signature: sha256=...</code> (HMAC-SHA256 do corpo com o segredo da chave). Confira assim:
        </p>
        <Code>{verify}</Code>
        <p>O aviso espera até 5 segundos pela sua resposta e não é repetido: em caso de dúvida, consulte o status.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Erros</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li><code>400</code>: o campo errado vem na mensagem, como <code>{'{ "erro": "itens[2].quantidade: deve ser um número inteiro de 1 a 99" }'}</code>.</li>
          <li><code>401</code>: chave inválida ou revogada.</li>
          <li><code>403</code>: o plano do restaurante não tem a API, ou ele não está recebendo pedidos agora.</li>
          <li><code>404</code>: pedido que não é desta chave. <code>413</code>: pedido maior que 256 KB.</li>
          <li><code>409</code>: o <code>codigo</code> já é de um pedido de outra origem do restaurante (o cardápio digital ou outra integração): use códigos próprios, como um prefixo do seu sistema.</li>
        </ul>
      </section>

      <footer className="border-t pt-4 text-sm text-slate-500">
        Dúvidas: <Link href="/ajuda" className="underline">Central de ajuda</Link>.
      </footer>
    </main>
  );
}
