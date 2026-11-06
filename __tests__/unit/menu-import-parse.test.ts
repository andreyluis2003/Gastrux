/**
 * Importar o cardápio por link (spec 2026-11-06): reading a store page, without the network.
 * The Zé Pediu page is a made-up store with the same structure as the real ones.
 */
import { blockedSourceMessage, jsonAfter, parseMenuPage } from '@/lib/cardapio/import/parse';
import { adjustPrice, validateImport } from '@/lib/cardapio/import/apply';

const zePediu = (data: unknown) =>
  `<html><head><title>Loja</title></head><body><script>window.__ON_APP_MOUNTED__ = [];window.__INITIAL_DATA__ = ${JSON.stringify(data)};window.__lgh = {"x":"}"};</script></body></html>`;

const STORE = {
  loja: { id: 1, nome_fantasia: 'Burger do Teste' },
  catalogo: {
    categorias: {
      '20': {
        id: 20, nome: 'Bebidas', ordem: 2,
        itens: { '201': { id: 201, nome: 'Refri lata', descricao: '350 ml', preco: 7, status: 'disponivel', foto_principal: 'http://inseguro/f.jpg', ordem: 0 } },
      },
      '10': {
        id: 10, nome: 'Burgers', ordem: 1,
        itens: {
          '102': { id: 102, nome: 'Duplo "Smash"', descricao: 'Dois   blends {e} queijo', preco: 34.9, preco_promocional: 29.9, status: 'disponivel', foto_principal: 'https://cdn.exemplo.com/duplo.jpg', cod_pdv: 'B2', ordem: 1,
            categorias_complementos: {
              '1': { nome: 'Escolha sua carne', obrigatorio: true, qtd_maxima: 1, complementos: { a: { nome: 'Bovina', preco: 0 }, b: { nome: 'Frango', preco: 2 } } },
              '2': { nome: 'Adicionais', obrigatorio: false, qtd_maxima: 10, complementos: { c: { nome: 'Bacon', preco: 4.5 } } },
            } },
          '101': { id: 101, nome: 'Simples', descricao: '', preco: '19.90', status: 'indisponivel', ordem: 0,
            categorias_complementos: { '2': { nome: 'Adicionais', complementos: { c: { nome: 'Bacon', preco: 4.5 } } } } },
          '103': { id: 103, nome: 'Sem preço', preco: 0, ordem: 2 },
        },
      },
    },
  },
};

describe('menu import: reading the page', () => {
  it('reads a Zé Pediu store in order, with photos, codes, availability and the addons once', () => {
    const r = parseMenuPage(zePediu(STORE));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = r.menu;
    expect(m.fonte).toBe('zepediu');
    expect(m.loja).toBe('Burger do Teste');
    expect(m.categorias.map((c) => c.nome)).toEqual(['Burgers', 'Bebidas']);
    expect(m.categorias[0].itens.map((i) => i.nome)).toEqual(['Simples', 'Duplo "Smash"']);
    const duplo = m.categorias[0].itens[1];
    // The full price, never the promotional one; spaces tidied
    expect(duplo).toMatchObject({ ref: '102', preco: 34.9, descricao: 'Dois blends {e} queijo', foto: 'https://cdn.exemplo.com/duplo.jpg', codigo: 'B2', disponivel: true });
    expect(m.categorias[0].itens[0]).toMatchObject({ preco: 19.9, disponivel: false, foto: null, codigo: null });
    // An http photo is dropped
    expect(m.categorias[1].itens[0].foto).toBeNull();
    expect(m.adicionais).toEqual([
      { grupo: 'Adicionais', nome: 'Bacon', preco: 4.5 },
      { grupo: 'Escolha sua carne', nome: 'Bovina', preco: 0 },
      { grupo: 'Escolha sua carne', nome: 'Frango', preco: 2 },
    ].sort((a, b) => (a.grupo === b.grupo ? 0 : a.grupo === 'Adicionais' ? -1 : 1)));
    expect(m.avisos.length).toBe(3);
  });

  it('reads a schema.org Menu in JSON-LD', () => {
    const ld = { '@context': 'https://schema.org', '@type': 'Restaurant', hasMenu: { '@type': 'Menu', name: 'Pizzaria X', hasMenuSection: [
      { name: 'Pizzas', hasMenuItem: [{ name: 'Calabresa', description: 'Grande', offers: { price: '49.90' }, image: 'https://img.exemplo.com/c.jpg' }, { name: 'Sem preço' }] },
    ] } };
    const r = parseMenuPage(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
    expect(r.ok && r.menu).toMatchObject({ fonte: 'schema', loja: 'Pizzaria X', categorias: [{ nome: 'Pizzas', itens: [{ nome: 'Calabresa', preco: 49.9, foto: 'https://img.exemplo.com/c.jpg' }] }] });
  });

  it('says what to do when there is no readable menu', () => {
    const r = parseMenuPage('<html><body><div id="app"></div></body></html>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/print ou o PDF/);
  });

  it('caps the import at 300 items', () => {
    const itens = Object.fromEntries(Array.from({ length: 320 }, (_, k) => [String(k), { id: k, nome: `Item ${k}`, preco: 10, ordem: k }]));
    const r = parseMenuPage(zePediu({ catalogo: { categorias: { '1': { nome: 'Tudo', itens } } } }));
    expect(r.ok && r.menu.categorias[0].itens.length).toBe(300);
  });

  it('sends iFood and Anota AI links to the photo import', () => {
    expect(blockedSourceMessage(new URL('https://www.ifood.com.br/delivery/sinop-mt/loja/abc'))).toMatch(/iFood/);
    expect(blockedSourceMessage(new URL('https://pedido.anota.ai/loja/x'))).toMatch(/Anota AI/);
    expect(blockedSourceMessage(new URL('https://madoburger.com.br/loja/pedidos'))).toBeNull();
  });

  it('finds the JSON object even with braces and quotes inside strings', () => {
    expect(jsonAfter('x = {"a":"}{\\"","b":{"c":1}}; y', 'x =')).toEqual({ a: '}{"', b: { c: 1 } });
    expect(jsonAfter('nothing here', 'x =')).toBeNull();
  });
});

describe('menu import: what the screen sends', () => {
  const base = { confirmaDono: true, ajustePct: 0, categorias: [{ nome: 'Burgers', itens: [{ nome: 'Duplo', descricao: '', preco: 34.9, foto: 'https://cdn/x.jpg', codigo: 'B2' }] }], adicionais: [] };

  it('adjusts prices by percent, to the cent', () => {
    expect(adjustPrice(34.9, -10)).toBe(31.41);
    expect(adjustPrice(19.9, 0)).toBe(19.9);
    expect(adjustPrice(0.01, -50)).toBe(0.01);
  });

  it('needs the owner box, a sane percent and real items', () => {
    expect(validateImport({ ...base, confirmaDono: false })).toMatchObject({ ok: false });
    expect(validateImport({ ...base, ajustePct: 80 })).toMatchObject({ ok: false });
    expect(validateImport({ ...base, categorias: [] })).toMatchObject({ ok: false });
    expect(validateImport({ ...base, categorias: [{ nome: 'X', itens: [{ nome: 'Y', preco: 0 }] }] })).toMatchObject({ ok: false });
    const ok = validateImport({ ...base, adicionais: [{ grupo: 'G', nome: 'Bacon', preco: 4.5 }, { grupo: '', nome: 'sem grupo', preco: 1 }] });
    expect(ok).toMatchObject({ ok: true, value: { adicionais: [{ grupo: 'G', nome: 'Bacon', preco: 4.5 }] } });
  });

  it('keeps only https photos', () => {
    const v = validateImport({ ...base, categorias: [{ nome: 'B', itens: [{ nome: 'A', preco: 5, foto: 'javascript:alert(1)' }, { nome: 'C', preco: 5, foto: 'http://x/y.jpg' }] }] });
    expect(v.ok && v.value.categorias[0].itens.map((i) => i.foto)).toEqual([null, null]);
  });
});

describe('menu import: which addresses the server may fetch', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolveStoreAddress } = require('@/lib/cardapio/import/fetch-page');
  it('only https to a public address, never the local network', async () => {
    expect(await resolveStoreAddress('http://203.0.113.7/x')).toBeNull();
    expect(await resolveStoreAddress('https://user:pw@203.0.113.7/x')).toBeNull();
    expect(await resolveStoreAddress('https://localhost/x')).toBeNull();
    expect(await resolveStoreAddress('https://printer.local/x')).toBeNull();
    expect(await resolveStoreAddress('https://10.0.0.5/x')).toBeNull();
    expect(await resolveStoreAddress('https://169.254.169.254/latest')).toBeNull();
    expect(await resolveStoreAddress('https://[::1]/x')).toBeNull();
    expect(await resolveStoreAddress('https://[64:ff9b::a00:1]/x')).toBeNull();
    expect(await resolveStoreAddress('https://54.232.120.143/x')).toEqual({ address: '54.232.120.143', family: 4 });
  });
});
