/** sendPlatformTemplate: a template without variables goes without the body component (Meta rejects it) */
import { sendPlatformTemplate } from '@/lib/agents/whatsapp/client';
import { LEAD_TEMPLATE } from '@/lib/agents/whatsapp/templates';

const realFetch = global.fetch;
let body: any;

beforeEach(() => {
  process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN = 'tok';
  process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID = 'pid';
  global.fetch = jest.fn(async (_url: any, init: any) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 });
  }) as any;
});
afterAll(() => {
  global.fetch = realFetch;
  delete process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID;
});

describe('sendPlatformTemplate', () => {
  it('omits the body component when there are no params', async () => {
    await sendPlatformTemplate('5511999990000', LEAD_TEMPLATE);
    expect(body.template.name).toBe('pedido_informacoes');
    expect(body.template.components).toEqual([{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'auth/signup' }] }]);
  });

  it('keeps the body component when there are params', async () => {
    await sendPlatformTemplate('5511999990000', { name: 'sem_caixa', bodyParams: ['Maria', 'Pizzaria'], linkPath: 'caixa' });
    expect(body.template.components.map((c: any) => c.type)).toEqual(['body', 'button']);
    expect(body.template.components[0].parameters).toEqual([{ type: 'text', text: 'Maria' }, { type: 'text', text: 'Pizzaria' }]);
  });
});
