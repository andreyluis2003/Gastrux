// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/nurturing/content
 * Retorna a sequência de conteúdo educativo para lead nurturing.
 * Usado internamente pelo daemon de automação.
 */

const NURTURING_SEQUENCE = [
  {
    day: 0,
    subject: 'Seu diagnóstico de restaurante está pronto',
    message: `Olá! 👋\n\nVocê usou nossa calculadora e descobriu dados importantes sobre seu restaurante.\n\n📊 Você sabia que o CMV ideal para restaurante é entre 28-35%?\n\nSe o seu está acima, cada prato vendido está rendendo menos do que deveria.\n\n💡 Dica rápida: Comece pesando os ingredientes dos seus 5 pratos mais vendidos. Só isso já revela onde está o desperdício.\n\nQuer descobrir o CMV real de cada prato? Crie sua conta gratuita no Gastrux:\nhttps://gastrux.com/auth/signup\n\n— Equipe Gastrux`,
    type: 'welcome',
  },
  {
    day: 3,
    subject: '3 sinais de que seu restaurante está perdendo dinheiro',
    message: `Olá novamente! 👋\n\n3 sinais de que seu restaurante pode estar perdendo dinheiro sem você saber:\n\n1️⃣ **Você não sabe o custo exato de cada prato** → Sem ficha técnica, é impossível precificar corretamente\n\n2️⃣ **Compra "no olho"** → Sem controle de estoque, desperdício vira rotina\n\n3️⃣ **Não monitora o CMV semanalmente** → O CMV pode variar 5-10pp em uma semana por conta de fornecedores\n\nA boa notícia: resolver o item 1 já impacta os outros dois.\n\n🔧 No Gastrux, cadastrar uma ficha técnica leva menos de 2 minutos. E o sistema calcula o custo automaticamente.\n\nhttps://gastrux.com/auth/signup\n\n— Equipe Gastrux`,
    type: 'educational',
  },
  {
    day: 7,
    subject: 'Como saber qual prato tirar do cardápio',
    message: `Olá! 🍽️\n\nVocê sabe qual prato do seu cardápio está **dando prejuízo**?\n\nA técnica que restaurantes de sucesso usam chama-se **Engenharia de Cardápio**. Funciona assim:\n\n⭐ **Stars** = vendem muito + margem alta → Destaque no cardápio\n🐴 **Horses** = vendem muito + margem baixa → Reformule a receita\n🧩 **Puzzles** = vendem pouco + margem alta → Promova mais\n🐕 **Dogs** = vendem pouco + margem baixa → Considere remover\n\nO Gastrux classifica seus pratos automaticamente nessas 4 categorias, usando seus dados reais de venda e custo.\n\n📊 Descubra quais são seus Stars e Dogs:\nhttps://gastrux.com/auth/signup\n\n— Equipe Gastrux`,
    type: 'educational',
  },
  {
    day: 14,
    subject: 'O erro de precificação que 80% dos restaurantes cometem',
    message: `Olá! 💰\n\nO erro mais comum na precificação de restaurantes:\n\n❌ "Multiplico o custo por 3" → Isso ignora custos fixos, desperdício e variação de fornecedor\n\n✅ O certo: Custo real (com desperdício) + rateio de custos fixos + margem desejada\n\nExemplo prático:\n- Custo ingredientes: R$ 12\n- Desperdício médio (8%): R$ 0,96\n- Rateio fixos por prato: R$ 4,50\n- Custo real: R$ 17,46\n- Para 35% de margem: venda a R$ 26,86\n\nSe você usa o multiplicador por 3, venderia a R$ 36 — pode parecer melhor, mas sem saber o custo real, você não sabe se está com margem de 20% ou 40%.\n\n🧮 O Gastrux calcula isso automaticamente para cada prato:\nhttps://gastrux.com/auth/signup\n\n— Equipe Gastrux`,
    type: 'educational',
  },
  {
    day: 21,
    subject: 'Última dica: como economizar 15% nas compras',
    message: `Olá! 🛒\n\nÚltima dica da nossa série:\n\n**Como economizar até 15% nas compras do restaurante:**\n\n1️⃣ **Cotação com 3 fornecedores** → O Gastrux registra preços e mostra quem está mais barato\n\n2️⃣ **Lista de compras inteligente** → Baseada no estoque atual + previsão de demanda\n\n3️⃣ **Monitorar variações** → Alerta quando um ingrediente sobe mais de 15%\n\n4️⃣ **Comprar na quantidade certa** → Sem excesso = menos desperdício\n\nEstas 4 práticas juntas podem reduzir seu CMV em 3-5 pontos percentuais. Em um restaurante que fatura R$ 80mil/mês, isso são R$ 2.400-4.000 de economia mensal.\n\n🚀 Comece seu controle gratuito agora:\nhttps://gastrux.com/auth/signup\n\n— Equipe Gastrux`,
    type: 'conversion',
  },
];

export async function GET() {
  return NextResponse.json({ sequence: NURTURING_SEQUENCE });
}
