# 🎨 Guia de Estilos - Restaurantes Platform

Este documento define o sistema de design, paleta de cores, tipografia e padrões de componentes para manter consistência visual em toda a plataforma.

## Princípios de Design

- **Simplicidade**: Minimalismo sem sacrificar funcionalidade
- **Rapidez**: Interface responsiva e performática
- **Clareza**: Hierarquia visual óbvia, ícones intuitivos
- **Acessibilidade**: Contraste adequado, suporte a teclado
- **Mobile-First**: Funciona perfeitamente em todos os dispositivos

## Paleta de Cores

### Cores Primárias

- **Primary Blue**: `#3B82F6` (hex) / `217 91% 52%` (HSL) - Para CTA, ações principais
- **Secondary Amber**: `#F59E0B` (hex) / `39 89% 49%` (HSL) - Para destaque, avisos
- **Accent Violet**: `#7C3AED` (hex) / `262 80% 50%` (HSL) - Para acentos especiais

### Cores Funcionais

- **Success**: `#10B981` - Operações bem-sucedidas
- **Warning**: `#F59E0B` - Avisos e atenção
- **Error**: `#EF4444` - Erros e ações destrutivas
- **Info**: `#3B82F6` - Informações gerais

### Escala de Cinza

- **Background**: `#FFFFFF` (light) / `#0F172A` (dark)
- **Surface**: `#F9FAFB` (light) / `#1E293B` (dark)
- **Border**: `#E5E7EB` (light) / `#475569` (dark)
- **Text**: `#1F2937` (light) / `#F3F4F6` (dark)

## Tipografia

### Fontes

- **Display**: Poppins (headings, hero)
- **Body**: DM Sans (corpo de texto, UI)
- **Mono**: JetBrains Mono (código, valores)

### Escala

- **H1**: 2.5rem / 3rem - Títulos principais
- **H2**: 2rem - Títulos de seção
- **H3**: 1.5rem - Subtítulos
- **H4**: 1.25rem - Labels importantes
- **Body**: 1rem - Texto padrão
- **Small**: 0.875rem - Descrições
- **Tiny**: 0.75rem - Hints, badges

## Espaciamento

Sistema baseado em múltiplos de 4px:

```
xs:  4px   (gap-1)
sm:  8px   (gap-2)
md:  16px  (gap-4)
lg:  24px  (gap-6)
xl:  32px  (gap-8)
2xl: 48px  (gap-12)
```

## Componentes Principais

### Buttons

```tsx
// Primary Action
<Button>Enviar</Button>

// Secondary
<Button variant="outline">Cancelar</Button>

// Danger
<Button variant="destructive">Deletar</Button>

// Ghost (minimal)
<Button variant="ghost">Ver mais</Button>
```

### Cards

Cards sem borders pesados. Shadow sutil em hover:

```tsx
<Card className="p-6 hover:shadow-lg transition-shadow">
  Conteúdo
</Card>
```

### Input Fields

- Border `1px` em `border-slate-200` (light) / `border-slate-700` (dark)
- Padding padrão: `px-3 py-2`
- Focus: `ring-2 ring-blue-500`
- Rounded: `rounded-lg` (padrão)

### Badges

Para status, tags, alertas:

```tsx
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
  Ativo
</span>
```

## Dark Mode

Todas as cores têm variantes para dark mode usando `dark:`:

```tsx
<div className="text-slate-900 dark:text-slate-100">
  Texto adaptativo
</div>
```

## Shadows

- `shadow-sm`: Leve, interações sutis
- `shadow-md`: Padrão, cards e modais
- `shadow-lg`: Destaque, hover states
- `shadow-xl`: Importante, overlays

## Animações

- Transições padrão: `150ms` (rápido)
- Transições normais: `250ms` (padrão)
- Transições lentas: `350ms` (importante)

```tsx
transition-all duration-200
```

## Padrões de Layout

### Page Structure

```tsx
<div className="min-h-screen bg-slate-50 dark:bg-slate-900">
  <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
    {/* Conteúdo */}
  </div>
</div>
```

### Responsive Grid

- Mobile: 1 coluna
- Tablet: 2 colunas (`sm:grid-cols-2`)
- Desktop: 3+ colunas (`lg:grid-cols-3`)

### Header Pattern

```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-xl sm:text-3xl font-bold">Título</h1>
    <p className="text-sm text-slate-600">Subtítulo</p>
  </div>
  <Button>Ação</Button>
</div>
```

## Ícones

Usar `lucide-react`:

```tsx
import { Plus, Search, ChevronRight } from 'lucide-react';

<Plus className="w-4 h-4" /> // Small
<Plus className="w-6 h-6" /> // Medium (padrão)
<Plus className="w-8 h-8" /> // Large
```

## Loading States

- Skeleton loaders para dados
- Spinner centrado para ações
- Smooth fade in de conteúdo

## Acessibilidade

- Sempre usar `aria-label` em ícones
- Contrast ratio mínimo 4.5:1
- Focus states visíveis
- Keyboard navigation completa

## Mobile Responsiveness

Breakpoints Tailwind padrão:

- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

Use `sm:` prefixes para ajustes mobile-first.

