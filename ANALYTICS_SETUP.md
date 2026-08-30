# Google Analytics 4 (GA4) Integration Guide

## Overview
Este documento descreve como o Google Analytics 4 foi integrado ao aplicativo Restaurantes para rastrear conversões e engajamento de usuários na landing page.

## Setup Inicial

### 1. Obter Measurement ID do GA4

1. Acesse [Google Analytics](https://analytics.google.com)
2. Crie uma nova propriedade GA4 ou selecione uma existente
3. Vá para **Admin > Data Streams > Web**
4. Copie o **Measurement ID** (formato: `G-XXXXXXXXXX`)

### 2. Configurar Variável de Ambiente

Adicione ao arquivo `.env.local`:

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Substitua `G-XXXXXXXXXX` com seu Measurement ID real.

**Nota**: A variável começa com `NEXT_PUBLIC_` para estar disponível no browser.

## Implementação Técnica

### Componentes Principais

#### 1. **GAScript** (`components/analytics/ga-script.tsx`)
- Inicializa o script gtag.js do Google
- Carregado automaticamente no layout root
- Configurações: anonimizar IP, desabilitar ad personalization

#### 2. **useAnalytics Hook** (`hooks/use-analytics.ts`)
Provê funções para rastreamento:

```typescript
const { trackEvent, trackConversion, trackCTAClick, trackSignup } = useAnalytics();

// Rastrear clique em CTA
trackCTAClick('hero_get_started', '/auth/signup');

// Rastrear conversão
trackConversion('free_trial_signup', 99.99, 'BRL');

// Rastrear evento customizado
trackEvent('feature_viewed', { feature_name: 'estoque' });
```

#### 3. **useScrollTracking Hook** (`hooks/use-scroll-tracking.ts`)
- Rastreia quando usuário atinge 25%, 50%, 75%, 100% da página
- Automaticamente envia eventos ao GA4

#### 4. **useTimeTracking Hook** (`hooks/use-time-tracking.ts`)
- Rastreia tempo gasto na página
- Envia ao GA4 quando usuário sai

#### 5. **useIntersectionObserver Hook** (`hooks/use-intersection-observer.ts`)
- Detecta quando uma seção entra no viewport
- Útil para rastrear visualizações de seções

## Eventos Rastreados

### Landing Page

| Evento | Descrição | Parâmetros |
|--------|-----------|-----------|
| `cta_hero_get_started` | Clique em "Começar Grátis" no hero | `destination: '/auth/signup'` |
| `cta_hero_view_features` | Clique em "Ver Funcionalidades" | `destination: '#features'` |
| `cta_final_get_started` | Clique em CTA final | `destination: '/auth/signup'` |
| `feature_0-5` | Clique em feature card | `feature_name` |
| `scroll_depth` | Scroll milestone | `scroll_percentage: 25/50/75/100` |
| `page_time` | Tempo na página | `time_spent_seconds` |
| `sign_up` | Signup completo | `method: 'email'/'google'` |
| `login` | Login completo | `method: 'email'` |

### Dashboard

| Evento | Descrição | Quando |
|--------|-----------|--------|
| `module_access` | Acesso a módulo do dashboard | Quando abre módulo |
| `feature_usage` | Uso de feature específica | Durante operação |
| `data_export` | Exportação de dados | Quando exporta CSV |

## Verificando Dados no GA4

### 1. Real-Time Report
- Vá para **Reports > Realtime**
- Atualiza a cada segundo
- Mostra atividades em tempo real

### 2. DebugView
- Ative **Admin > DebugView** (quando GA4 está em test mode)
- Ver eventos sendo capturados em tempo real

### 3. Google Tag Assistant
- Instale a [extensão Chrome](https://chrome.google.com/webstore/detail/tag-assistant-legacy-by-g/ojkmkhbaajlghbccmlbilmahgjiphbjm)
- Verifica se GA está funcionando no site

## Conversão Tracking

### Marcar Eventos como Conversão no GA4

1. Vá para **Admin > Events**
2. Localize o evento (ex: `sign_up`)
3. Clique em **Mark as conversion**

Eventos importantes para marcar:
- `sign_up` - Signup de novo usuário
- `cta_hero_get_started` - CTA hero clicado
- `cta_final_get_started` - CTA final clicado

### Funnel Analysis

Crie funis para rastrear:
1. Landing Page view
2. CTA click
3. Signup page view
4. Signup completo

## Dashboard Customizado

### Recomendadas Métricas

**Top KPIs**:
- Users
- Sessions
- Conversion Rate (signup/landing)
- Average Session Duration
- Bounce Rate

**Comportamento de Usuários**:
- Top Landing Pages
- Top CTAs clicked
- Scroll Depth Distribution
- Device/Browser breakdown

## Troubleshooting

### GA4 não está capturando dados

1. **Verificar Measurement ID**
   ```bash
   echo $NEXT_PUBLIC_GA_MEASUREMENT_ID
   ```

2. **Checar no browser console**
   ```javascript
   // Ver se gtag está disponível
   console.log(window.gtag);
   // Ver se eventos estão sendo enviados
   gtag('event', 'test_event', { test: true });
   ```

3. **Usar Tag Assistant**
   - Instalar extensão Chrome
   - Abrir site e verificar eventos

4. **Checar Ad Blockers**
   - Ad blockers podem bloquear GA4
   - Teste com Ad Blocker desativado

### Dados aparecem depois de 24-48 horas

Isso é normal no GA4. Use **Realtime** para ver imediatamente.

## Recursos Adicionais

- [GA4 Setup Checklist](https://support.google.com/analytics/answer/10089681)
- [GA4 Event Documentation](https://developers.google.com/tag-platform/gtagjs/reference/events)
- [GA4 Best Practices](https://support.google.com/analytics/answer/9964640)
- [gtag.js Reference](https://developers.google.com/tag-platform/gtagjs/reference)

## Próximos Passos

1. **Implementar A/B Testing**
   - Usar GA4 A/B Testing
   - Testar diferentes CTAs

2. **Adicionar Event Tracking Customizado**
   - Rastrear ações específicas do usuário
   - Criar eventos customizados

3. **Setup de Alertas**
   - Alertas para conversões
   - Alertas para anomalias

4. **Integração com Google Ads**
   - Conectar GA4 com Google Ads
   - Rastrear conversões em campanhas
