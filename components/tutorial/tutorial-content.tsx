'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { GlassCard } from '@/components/ui/glass-card';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate';
import { Button } from '@/components/ui/button';
import {
  Package,
  BookOpen,
  Calendar,
  Warehouse,
  TrendingUp,
  DollarSign,
  BarChart3,
  AlertCircle,
  ChevronRight,
  ShoppingCart,
  FileText,
  Scale,
  Truck,
  LineChart,
  Bell,
} from 'lucide-react';

const tutorials = [
  {
    id: 'insumos',
    title: 'Cadastro de Insumos',
    icon: Package,
    color: 'bg-blue-50 dark:bg-blue-900/20',
    accentColor: 'text-blue-600 dark:text-blue-400',
    description: 'Gerenciar ingredientes e suprimentos',
    sections: [
      {
        step: 1,
        title: 'Acessando o Módulo',
        content: 'Clique no card "Cadastro de Insumos" no dashboard. Você será levado à página com a lista de todos os ingredientes cadastrados na plataforma.',
      },
      {
        step: 2,
        title: 'Criando um Novo Insumo',
        content: 'Clique no botão "Novo Insumo" no topo da página. Preencha os campos: Nome do ingrediente, descrição, categoria, unidade padrão, e preço de referência. Clique em "Salvar".',
      },
      {
        step: 3,
        title: 'Buscando Insumos',
        content: 'Use a barra de busca para encontrar ingredientes rapidamente. Você pode filtrar por nome ou características do insumo.',
      },
      {
        step: 4,
        title: 'Editando um Insumo',
        content: 'Clique em qualquer insumo da lista para ver os detalhes. Clique em "Editar" para modificar as informações (nome, descrição, categoria, preços, etc.).',
      },
      {
        step: 5,
        title: 'Gerenciando Fornecedores',
        content: 'Na página de detalhes do insumo, você pode adicionar e gerenciar os fornecedores desse ingrediente, incluindo preços e condições de compra.',
      },
    ],
  },
  {
    id: 'receitas',
    title: 'Ficha Técnica',
    icon: BookOpen,
    color: 'bg-green-50 dark:bg-green-900/20',
    accentColor: 'text-green-600 dark:text-green-400',
    description: 'Gerenciar receitas e fichas técnicas',
    sections: [
      {
        step: 1,
        title: 'Acessando o Módulo',
        content: 'Clique no card "Ficha Técnica" no dashboard. A página exibe todas as suas receitas cadastradas com informações resumidas.',
      },
      {
        step: 2,
        title: 'Criando uma Nova Receita',
        content: 'Clique em "Nova Receita". Preencha: nome da receita, descrição, rendimento (quantidade e unidade), e selecione os ingredientes que compõem a receita com suas respectivas quantidades.',
      },
      {
        step: 3,
        title: 'Adicionando Ingredientes',
        content: 'Ao criar uma receita, adicione cada ingrediente clicando em "+ Adicionar Ingrediente". Selecione o insumo, quantidade e unidade. O sistema calcula automaticamente o custo.',
      },
      {
        step: 4,
        title: 'Visualizando Detalhes',
        content: 'Clique em uma receita para ver todos os ingredientes, custo total, custo por porção, e outras informações técnicas.',
      },
      {
        step: 5,
        title: 'Adicionando Ingredientes na Página de Detalhes',
        content: 'Na página de detalhes da receita, use o botão "Adicionar Ingrediente" para incluir novos insumos diretamente. Selecione o insumo, defina a quantidade e unidade. Se o ingrediente já existir, ele será atualizado automaticamente.',
      },
      {
        step: 6,
        title: 'Editando Receitas',
        content: 'Na página de detalhes, clique em "Editar" para modificar nome, ingredientes, quantidades ou rendimento da receita.',
      },
    ],
  },
  {
    id: 'planejamento',
    title: 'Planejamento de Produção',
    icon: Calendar,
    color: 'bg-orange-50 dark:bg-orange-900/20',
    accentColor: 'text-orange-600 dark:text-orange-400',
    description: 'Planejar produção diária',
    sections: [
      {
        step: 1,
        title: 'Acessando o Módulo',
        content: 'Clique no card "Planejamento de Produção". Você verá a lista de planos de produção criados, organizados por data.',
      },
      {
        step: 2,
        title: 'Criando um Novo Plano',
        content: 'Clique em "Novo Plano de Produção". Selecione a data do plano e clique em "Criar Plano".',
      },
      {
        step: 3,
        title: 'Inserindo Itens ao Plano',
        content: 'No plano criado, clique no botão "Inserir Item". Selecione uma receita e defina a quantidade que será produzida. O sistema calcula automaticamente o custo estimado.',
      },
      {
        step: 4,
        title: 'Editando Itens do Plano',
        content: 'Cada item do plano possui um botão de edição (ícone de lápis). Clique para alterar a quantidade do item. O custo estimado será recalculado automaticamente.',
      },
      {
        step: 5,
        title: 'Removendo Itens do Plano',
        content: 'Para remover um item, clique no botão de exclusão (ícone de lixeira vermelho) no card do item. Confirme a remoção na caixa de diálogo.',
      },
      {
        step: 6,
        title: 'Editando o Plano',
        content: 'Clique no botão "Editar" para alterar o status (Rascunho, Confirmado, Em Produção, Concluído, Cancelado) e observações do plano.',
      },
      {
        step: 7,
        title: 'Deletando o Plano',
        content: 'Use o botão "Deletar" para remover todo o plano de produção. Esta ação é irreversível.',
      },
    ],
  },
  {
    id: 'estoque',
    title: 'Estoque Operacional',
    icon: Warehouse,
    color: 'bg-red-50 dark:bg-red-900/20',
    accentColor: 'text-red-600 dark:text-red-400',
    description: 'Gerenciar estoque e movimentação',
    sections: [
      {
        step: 1,
        title: 'Acessando o Módulo',
        content: 'Clique no card "Estoque Operacional". A página mostra o estoque atual de todos os ingredientes com indicadores de saúde (crítico, baixo, ok).',
      },
      {
        step: 2,
        title: 'Visualizando Status do Estoque',
        content: 'Cada insumo mostra a quantidade atual, estoque mínimo recomendado e status visual (vermelho=crítico, amarelo=baixo, verde=ok).',
      },
      {
        step: 3,
        title: 'Registrando Entradas',
        content: 'Clique em um insumo para registrar uma entrada. Selecione "Entrada", insira a quantidade, preço unitário e motivo (compra, devolução, etc.).',
      },
      {
        step: 4,
        title: 'Registrando Saídas',
        content: 'Para registrar consumo, clique no insumo e selecione "Saída". Defina a quantidade saída e o motivo (consumo, ajuste, perda, etc.).',
      },
      {
        step: 5,
        title: 'Filtrando e Buscando',
        content: 'Use a barra de busca e filtros avançados para encontrar insumos específicos por categoria, status de estoque ou faixa de quantidade.',
      },
    ],
  },
  {
    id: 'analise-consumo',
    title: 'Análise de Consumo',
    icon: TrendingUp,
    color: 'bg-purple-50 dark:bg-purple-900/20',
    accentColor: 'text-purple-600 dark:text-purple-400',
    description: 'Visualize tendências e padrões de consumo',
    sections: [
      {
        step: 1,
        title: 'Acessando o Módulo',
        content: 'Clique no card "Análise de Consumo" no dashboard. Você verá gráficos e estatísticas sobre como seus ingredientes estão sendo consumidos.',
      },
      {
        step: 2,
        title: 'Visualizando Tendências',
        content: 'A aba "Tendências" mostra um gráfico com o consumo semanal de insumos, permitindo identificar padrões de picos e quedas.',
      },
      {
        step: 3,
        title: 'Top Ingredientes Consumidos',
        content: 'Veja quais são os 5 insumos mais consumidos na sua operação, com números absolutos de quantidade consumida.',
      },
      {
        step: 4,
        title: 'Análise por Categoria',
        content: 'Descubra quais categorias de ingredientes têm maior ou menor consumo, ajudando na tomada de decisões sobre variedade de menu.',
      },
      {
        step: 5,
        title: 'Relatórios Exportáveis',
        content: 'Exporte os dados de consumo em formato CSV para análises mais detalhadas em planilhas ou outras ferramentas.',
      },
    ],
  },
  {
    id: 'analise-custos',
    title: 'Análise de Custos',
    icon: DollarSign,
    color: 'bg-emerald-50 dark:bg-emerald-900/20',
    accentColor: 'text-emerald-600 dark:text-emerald-400',
    description: 'Acompanhe tendências de preços e custos',
    sections: [
      {
        step: 1,
        title: 'Acessando o Módulo',
        content: 'Clique em "Análise de Custos". O módulo exibe análises detalhadas sobre custos de ingredientes, receitas e tendências de preços.',
      },
      {
        step: 2,
        title: 'Custo de Ingredientes',
        content: 'Veja o custo atual de cada ingrediente, histórico de preços e tendências. Identifique insumos com flutuação significativa de preço.',
      },
      {
        step: 3,
        title: 'Custo de Receitas',
        content: 'Visualize o custo total de cada receita e custo por porção. Compare receitas para identificar as mais caras e as mais econômicas.',
      },
      {
        step: 4,
        title: 'Comparação de Fornecedores',
        content: 'Compare preços dos mesmos ingredientes entre diferentes fornecedores para encontrar as melhores negociações.',
      },
      {
        step: 5,
        title: 'Alertas de Preço',
        content: 'Configure alertas automáticos para ser notificado quando um insumo atingir um preço máximo que você definir.',
      },
    ],
  },
  {
    id: 'compras',
    title: 'Listas de Compras',
    icon: ShoppingCart,
    color: 'bg-cyan-50 dark:bg-cyan-900/20',
    accentColor: 'text-cyan-600 dark:text-cyan-400',
    description: 'Criar e gerenciar listas de compras',
    sections: [
      {
        step: 1,
        title: 'Acessando o Módulo',
        content: 'Clique em "Compras" no menu lateral. Você verá todas as listas de compras criadas, com status e data.',
      },
      {
        step: 2,
        title: 'Criando uma Nova Lista',
        content: 'Clique em "Nova Lista de Compras". Defina um nome para a lista e clique em "Criar".',
      },
      {
        step: 3,
        title: 'Adicionando Itens Catalogados',
        content: 'Na lista criada, clique em "Adicionar Item". Selecione um insumo já cadastrado no sistema, defina a quantidade e unidade desejadas.',
      },
      {
        step: 4,
        title: 'Adicionando Itens Não Catalogados',
        content: 'Para itens que não estão no cadastro de insumos, use a opção "Item não catalogado". Digite o nome do item, quantidade e unidade manualmente.',
      },
      {
        step: 5,
        title: 'Editando e Removendo Itens',
        content: 'Cada item da lista possui botões de edição (lápis) e exclusão (lixeira). Edite quantidades ou remova itens conforme necessário.',
      },
      {
        step: 6,
        title: 'Gerenciando a Lista',
        content: 'Atualize o status da lista (Pendente, Em Compra, Concluída) e adicione observações. Você também pode deletar a lista inteira se necessário.',
      },
    ],
  },
  {
    id: 'notas-fiscais',
    title: 'Notas Fiscais',
    icon: FileText,
    color: 'bg-amber-50 dark:bg-amber-900/20',
    accentColor: 'text-amber-600 dark:text-amber-400',
    description: 'Upload e leitura automática de notas fiscais via OCR',
    sections: [
      {
        step: 1,
        title: 'Acessando o Módulo',
        content: 'Clique em "Notas Fiscais" no menu lateral. Você verá as notas fiscais já processadas e a opção de enviar novas.',
      },
      {
        step: 2,
        title: 'Enviando uma Nota Fiscal',
        content: 'Clique em "Upload de Nota Fiscal" e selecione o arquivo (imagem ou PDF). O sistema utiliza OCR (reconhecimento óptico) para extrair automaticamente os dados da nota.',
      },
      {
        step: 3,
        title: 'Revisando Dados Extraídos',
        content: 'Após o processamento, revise os dados extraídos: fornecedor, itens, quantidades, preços e valores totais. Corrija qualquer informação que não tenha sido lida corretamente.',
      },
      {
        step: 4,
        title: 'Vinculando a Insumos',
        content: 'O sistema tenta vincular automaticamente os itens da nota aos insumos cadastrados. Confirme ou ajuste as vinculações para manter o controle preciso.',
      },
    ],
  },
  {
    id: 'escalonamento',
    title: 'Escalonamento de Receitas',
    icon: Scale,
    color: 'bg-indigo-50 dark:bg-indigo-900/20',
    accentColor: 'text-indigo-600 dark:text-indigo-400',
    description: 'Calcular proporções para diferentes quantidades',
    sections: [
      {
        step: 1,
        title: 'Acessando o Módulo',
        content: 'Clique em "Escalonamento" no menu lateral. O módulo permite calcular as quantidades de ingredientes para diferentes rendimentos de uma receita.',
      },
      {
        step: 2,
        title: 'Selecionando uma Receita',
        content: 'Use o seletor de receitas para escolher qual receita deseja escalonar. As receitas disponíveis são as que já estão cadastradas no sistema.',
      },
      {
        step: 3,
        title: 'Definindo a Quantidade Desejada',
        content: 'Informe a quantidade desejada de porções ou rendimento. O sistema calcula automaticamente as proporções de cada ingrediente.',
      },
      {
        step: 4,
        title: 'Visualizando Resultados',
        content: 'Veja a tabela com todos os ingredientes e suas quantidades ajustadas proporcionalmente. O custo total também é recalculado.',
      },
    ],
  },
  {
    id: 'fornecedores',
    title: 'Fornecedores',
    icon: Truck,
    color: 'bg-teal-50 dark:bg-teal-900/20',
    accentColor: 'text-teal-600 dark:text-teal-400',
    description: 'Gerenciar fornecedores e cotações',
    sections: [
      {
        step: 1,
        title: 'Acessando o Módulo',
        content: 'Clique em "Fornecedores" no menu lateral. Você verá a lista de todos os fornecedores cadastrados com informações de contato e status.',
      },
      {
        step: 2,
        title: 'Cadastrando um Fornecedor',
        content: 'Clique em "Novo Fornecedor". Preencha: nome, CNPJ, telefone, e-mail, endereço e observações. Clique em "Salvar".',
      },
      {
        step: 3,
        title: 'Vinculando Insumos ao Fornecedor',
        content: 'Na página de detalhes do fornecedor, vincule os insumos que ele fornece com os respectivos preços e condições.',
      },
      {
        step: 4,
        title: 'Comparando Fornecedores',
        content: 'Use o módulo de Análise de Custos para comparar preços do mesmo insumo entre diferentes fornecedores e encontrar a melhor opção.',
      },
    ],
  },
  {
    id: 'previsoes',
    title: 'Previsões',
    icon: LineChart,
    color: 'bg-pink-50 dark:bg-pink-900/20',
    accentColor: 'text-pink-600 dark:text-pink-400',
    description: 'Previsões de consumo e demanda',
    sections: [
      {
        step: 1,
        title: 'Acessando o Módulo',
        content: 'Clique em "Previsões" no menu lateral. O módulo exibe projeções de consumo baseadas no histórico de dados do seu restaurante.',
      },
      {
        step: 2,
        title: 'Visualizando Previsões de Consumo',
        content: 'Veja gráficos com previsões de consumo dos principais insumos para os próximos dias ou semanas, baseados em tendências históricas.',
      },
      {
        step: 3,
        title: 'Planejando Compras',
        content: 'Use as previsões para planejar suas compras com antecedência, evitando faltas ou excessos de estoque.',
      },
    ],
  },
  {
    id: 'alertas',
    title: 'Alertas',
    icon: Bell,
    color: 'bg-rose-50 dark:bg-rose-900/20',
    accentColor: 'text-rose-600 dark:text-rose-400',
    description: 'Notificações e alertas do sistema',
    sections: [
      {
        step: 1,
        title: 'Acessando o Módulo',
        content: 'Clique em "Alertas" no menu lateral. Você verá todos os alertas ativos do sistema, incluindo estoque baixo, vencimentos e variações de preço.',
      },
      {
        step: 2,
        title: 'Tipos de Alertas',
        content: 'O sistema gera alertas automáticos para: estoque crítico, insumos próximos do vencimento, variações significativas de preço e itens sem fornecedor.',
      },
      {
        step: 3,
        title: 'Gerenciando Alertas',
        content: 'Marque alertas como lidos ou resolva-os tomando as ações sugeridas. Os alertas críticos ficam destacados em vermelho.',
      },
    ],
  },
];

export function TutorialContent() {
  const [selectedTutorial, setSelectedTutorial] = useState(tutorials[0].id);
  const currentTutorial = tutorials.find((t) => t.id === selectedTutorial);

  if (!currentTutorial) return null;

  const Icon = currentTutorial.icon;

  return (
    <FadeIn>
      <div className="space-y-8">
        {/* Tutorial Selector */}
        <Stagger staggerDelay={0.05}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tutorials.map((tutorial) => {
              const TutorialIcon = tutorial.icon;
              const isSelected = selectedTutorial === tutorial.id;

              return (
                <StaggerItem key={tutorial.id}>
                  <button
                    onClick={() => setSelectedTutorial(tutorial.id)}
                    className={`text-left transition-all duration-200 ${
                      isSelected
                        ? 'ring-2 ring-primary scale-105'
                        : 'hover:scale-102 hover:shadow-md'
                    }`}
                  >
                    <Card
                      className={`p-4 h-full ${
                        isSelected
                          ? 'bg-primary/10 dark:bg-primary/20 border-primary'
                          : tutorial.color
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            isSelected
                              ? 'bg-primary/20 dark:bg-primary/30'
                              : 'bg-white/50 dark:bg-slate-900/50'
                          }`}
                        >
                          <TutorialIcon
                            className={`w-5 h-5 ${
                              isSelected
                                ? 'text-primary'
                                : tutorial.accentColor
                            }`}
                          />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                            {tutorial.title}
                          </h3>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                            {tutorial.description}
                          </p>
                        </div>
                        {isSelected && <ChevronRight className="w-5 h-5 text-primary flex-shrink-0" />}
                      </div>
                    </Card>
                  </button>
                </StaggerItem>
              );
            })}
          </div>
        </Stagger>

        {/* Tutorial Content */}
        <FadeIn delay={0.2}>
          <GlassCard className="p-6 sm:p-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8 pb-6 border-b border-primary/10">
              <div className={`p-3 rounded-lg ${currentTutorial.color}`}>
                <Icon className={`w-8 h-8 ${currentTutorial.accentColor}`} />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {currentTutorial.title}
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mt-1">
                  {currentTutorial.description}
                </p>
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-6">
              {currentTutorial.sections.map((section) => (
                <div key={section.step}>
                  <div className="flex gap-4 sm:gap-6">
                    {/* Step Number */}
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20 dark:bg-primary/30 border-2 border-primary">
                        <span className="font-bold text-primary text-sm">{section.step}</span>
                      </div>
                    </div>

                    {/* Step Content */}
                    <div className="flex-1 pt-1">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
                        {section.title}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                        {section.content}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </FadeIn>

        {/* Tips Section */}
        <FadeIn delay={0.3}>
          <Card className="p-6 sm:p-8 border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-900/20">
            <div className="flex gap-4">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Dicas Úteis</h3>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <li>✓ Use a busca para encontrar rapidamente qualquer insumo ou receita</li>
                  <li>✓ Configure alertas de estoque crítico para não perder nenhum ingrediente importante</li>
                  <li>✓ Exporte relatórios regulares para análise histórica de dados</li>
                  <li>✓ Mantenha os preços de fornecedores atualizados para análises precisas de custos</li>
                  <li>✓ Use os filtros avançados para encontrar informações específicas rapidamente</li>
                </ul>
              </div>
            </div>
          </Card>
        </FadeIn>
      </div>
    </FadeIn>
  );
}
