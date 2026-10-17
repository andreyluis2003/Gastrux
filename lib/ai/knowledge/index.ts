import caixa from './caixa';
import cardapio from './cardapio';
import contagem from './contagem';
import contasConsumo from './contas-consumo';
import equipe from './equipe';
import estoque from './estoque';
import etiquetas from './etiquetas';
import financeiro from './financeiro';
import fiscal from './fiscal';
import pagamentoMesa from './pagamento-mesa';
import planos from './planos';
import vender from './vender';

/**
 * "Pergunte ao Gastrux" manual (spec 2026-10-16 ia-assistente §4.4). Fixed order (prompt cache).
 * Every feature change updates its area file here (memory rule feedback_gastrux-ai-knowledge).
 */
export const KNOWLEDGE = [vender, caixa, pagamentoMesa, cardapio, estoque, contagem, etiquetas, financeiro, contasConsumo, fiscal, planos, equipe].join('\n\n');
