import type Anthropic from '@anthropic-ai/sdk';

export type AiRole = 'OWNER' | 'MANAGER' | 'ADMIN' | 'CASHIER' | 'COOK';
const M: AiRole[] = ['OWNER', 'MANAGER', 'ADMIN'];
export const isManagerRole = (role: string) => (M as string[]).includes(role);

const period = {
  inicio: { type: 'string', description: 'Primeiro dia, AAAA-MM-DD (horário de Brasília)' },
  fim: { type: 'string', description: 'Último dia, AAAA-MM-DD, incluído' },
};
const closed = (properties: Record<string, unknown>) => ({
  type: 'object' as const, properties, required: Object.keys(properties), additionalProperties: false,
});

/** Spec 2026-10-16 ia-assistente §4.3; order is fixed (prompt cache) */
const DEFS = [
  { name: 'vendas_periodo', roles: M, schema: closed(period),
    description: 'Faturamento do período pelo critério do Caixa: total, número de vendas, ticket médio, salão, delivery, taxa de serviço incluída e valor por forma de pagamento.' },
  { name: 'itens_vendidos', roles: [...M, 'CASHIER', 'COOK'], schema: closed(period),
    description: 'Itens vendidos no período, do mais vendido ao menos vendido, com quantidade (e receita, para dono e gerente). Inclui comandas, balcão e delivery.' },
  { name: 'caixa_turno', roles: [...M, 'CASHIER'], schema: closed({}),
    description: 'Turnos de caixa abertos agora: quando abriu, troco inicial, vendas do turno, valor esperado por forma de pagamento e despesas.' },
  { name: 'mesas_agora', roles: [...M, 'CASHIER', 'COOK'], schema: closed({}),
    description: 'Mesas e comandas abertas agora: número da mesa, há quanto tempo está aberta, valor aproximado em aberto e se chamou o garçom para pagar.' },
  { name: 'contagem_dia', roles: [...M, 'CASHIER', 'COOK'], schema: closed({}),
    description: 'Contagem de espetos / contagem do dia: a noite aberta (início, montados, vendidos, perdas, deveria ter por item) e as últimas 7 noites fechadas com as diferenças.' },
  { name: 'validades', roles: [...M, 'COOK'], schema: closed({}),
    description: 'Etiquetas de validade vencidas e que vencem hoje (controle de validades do plano Pro).' },
  { name: 'estoque_baixo', roles: [...M, 'COOK'], schema: closed({}),
    description: 'Insumos com estoque abaixo do mínimo cadastrado, com quantidade atual e mínimo.' },
  { name: 'ficha_tecnica', roles: [...M, 'COOK'], schema: closed({ nome: { type: 'string', description: 'Nome ou parte do nome do item' } }),
    description: 'Ficha técnica de um item do cardápio: ingredientes e quantidades; para dono e gerente também custo, preço e margem.' },
  { name: 'dre_resumo', roles: M, schema: closed(period),
    description: 'DRE do período: receita bruta, deduções, receita líquida, CMV, despesas (gerais, folha, contas de consumo, taxas) e resultado.' },
  { name: 'contas_consumo', roles: M, schema: closed({}),
    description: 'Contas de consumo (energia, água, gás, telefone, outras): último mês lançado de cada uma e, no Pro, variação contra o mês anterior e a média de 3 meses.' },
  { name: 'notas_fiscais', roles: M, schema: closed(period),
    description: 'Notas fiscais (NFC-e) do período: quantas emitidas, rejeitadas e canceladas, e o motivo das últimas rejeitadas.' },
  { name: 'plano', roles: [...M, 'CASHIER', 'COOK'], schema: closed({}),
    description: 'Plano do restaurante, perguntas à IA usadas e restantes no mês.' },
  { name: 'progresso_implantacao', roles: M, schema: closed({}),
    description: 'Etapas da implantação do restaurante (caixa, primeira venda, cardápio, mesas, equipe, endereço, NFC-e): quais estão feitas, a próxima e o link da tela de cada uma.' },
  { name: 'propor_cardapio', roles: M, schema: closed({
      categorias: { type: 'array', items: closed({ nome: { type: 'string' }, itens: { type: 'array', items: closed({
        nome: { type: 'string' }, descricao: { type: 'string', description: 'Pode ser vazio' }, preco: { type: 'number', description: 'Preço em reais, por exemplo 32.9' } }) } }) },
      incompleto: { type: 'boolean', description: 'true se o cardápio não coube inteiro ou parte não foi lida' } }),
    description: 'Monta um RASCUNHO de cardápio (categorias, itens, descrição, preço) para o dono revisar e confirmar. Não grava nada no cardápio.' },
  { name: 'propor_mesas', roles: M, schema: closed({
      quantidade: { type: 'integer' }, inicio: { type: 'integer', description: 'Primeiro número' },
      area: { type: 'string', description: 'Área, por exemplo Salão' }, lugares: { type: 'integer' } }),
    description: 'Monta um RASCUNHO de mesas (quantidade, número inicial, área, lugares) para o dono revisar e confirmar. Não cria mesas.' },
  { name: 'propor_equipe', roles: M, schema: closed({
      pessoas: { type: 'array', items: closed({ nome: { type: 'string' }, email: { type: 'string', description: 'Pode ser vazio se não informado' },
        papel: { type: 'string', enum: ['GERENTE', 'CAIXA', 'COZINHA'], description: 'Garçom = CAIXA' } }) } }),
    description: 'Monta um RASCUNHO de cadastro de funcionários (nome, e-mail, papel) para o dono revisar e confirmar. Não cria usuários.' },
] as const;

export type ToolName = (typeof DEFS)[number]['name'];
export const TOOL_ROLES = Object.fromEntries(DEFS.map((d) => [d.name, d.roles])) as Record<ToolName, AiRole[]>;

export function toolsFor(role: AiRole): Anthropic.Tool[] {
  return DEFS.filter((d) => (d.roles as readonly string[]).includes(role)).map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: d.schema as Anthropic.Tool['input_schema'],
    strict: true,
  }));
}
