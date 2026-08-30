'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FadeIn,
  ScaleIn,
  SlideIn,
  Stagger,
  StaggerItem,
  HoverLift,
  PressScale,
  SkeletonPulse,
} from '@/components/ui/animate';
import { PageTransition } from '@/components/ui/page-transition';
import { MotionButton } from '@/components/ui/motion-button';
import { MotionCard } from '@/components/ui/motion-card';
import { AccessibleButton } from '@/components/ui/accessible-button';
import { AccessibleHeading } from '@/components/ui/accessible-heading';
import { SkipLink } from '@/components/ui/skip-link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Sparkline } from '@/components/ui/sparkline';
import { LogOut, Copy, Check, Zap, Eye, EyeOff } from 'lucide-react';

const ComponentShowcase = () => {
  const [copied, setCopied] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const sparklineData = [
    { name: 'Jan', value: 400 },
    { name: 'Feb', value: 300 },
    { name: 'Mar', value: 500 },
    { name: 'Apr', value: 450 },
    { name: 'May', value: 600 },
  ];

  return (
    <PageTransition>
      <SkipLink targetId="main-content" />
      
      <main
        id="main-content"
        className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-emerald-50/20 dark:from-slate-950 dark:via-blue-950/20 dark:to-emerald-950/10"
      >
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden border-b border-primary/10"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-emerald-500/5" />
          
          <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
            <FadeIn className="text-center">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold bg-gradient-to-r from-primary via-emerald-500 to-blue-500 bg-clip-text text-transparent mb-4">
                Component Showcase
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
                Explore todos os componentes avançados da FASE 3 com exemplos interativos e código
              </p>
            </FadeIn>
          </div>
        </motion.div>

        {/* Content Sections */}
        <div className="mx-auto max-w-6xl px-4 py-12 space-y-16">
          {/* Animation Components */}
          <section className="space-y-6">
            <AccessibleHeading level="h2" className="text-3xl">
              ✨ Animation Components
            </AccessibleHeading>
            
            <Stagger staggerDelay={0.1}>
              <StaggerItem>
                <MotionCard hoverLift>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">FadeIn</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(
                            '<FadeIn delay={0.2}>\n  Seu conteúdo aqui\n</FadeIn>',
                            'fadein'
                          )
                        }
                      >
                        {copied === 'fadein' ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Reveal content com fade effect. Útil para cards, alerts e modals.
                    </p>
                    <div className="bg-muted/30 p-4 rounded-lg">
                      <FadeIn>
                        <div className="bg-primary/10 border border-primary/20 rounded p-3 text-sm">
                          Conteúdo aparecendo com fade in...
                        </div>
                      </FadeIn>
                    </div>
                  </div>
                </MotionCard>
              </StaggerItem>

              <StaggerItem>
                <MotionCard hoverLift>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">ScaleIn</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(
                            '<ScaleIn delay={0.1}>\n  Pop-in effect\n</ScaleIn>',
                            'scalein'
                          )
                        }
                      >
                        {copied === 'scalein' ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Pop-in effect com scale animation. Perfeito para modals e notificações.
                    </p>
                    <div className="bg-muted/30 p-4 rounded-lg">
                      <ScaleIn>
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-3 text-sm">
                          🎯 Pop-in animation!
                        </div>
                      </ScaleIn>
                    </div>
                  </div>
                </MotionCard>
              </StaggerItem>

              <StaggerItem>
                <MotionCard hoverLift>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">SlideIn (Direcional)</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(
                            '<SlideIn direction="up">\n  Slide from bottom\n</SlideIn>',
                            'slidein'
                          )
                        }
                      >
                        {copied === 'slidein' ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Entrada direcional: up, left, right. Ótimo para sidebar e drawers.
                    </p>
                    <div className="grid grid-cols-3 gap-2 bg-muted/30 p-4 rounded-lg">
                      <SlideIn direction="left">
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2 text-xs text-center">
                          ← Left
                        </div>
                      </SlideIn>
                      <SlideIn direction="up">
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2 text-xs text-center">
                          ↑ Up
                        </div>
                      </SlideIn>
                      <SlideIn direction="right">
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2 text-xs text-center">
                          Right →
                        </div>
                      </SlideIn>
                    </div>
                  </div>
                </MotionCard>
              </StaggerItem>
            </Stagger>
          </section>

          {/* Micro-Interactions */}
          <section className="space-y-6">
            <AccessibleHeading level="h2" className="text-3xl">
              🎯 Micro-Interactions
            </AccessibleHeading>

            <Stagger staggerDelay={0.1}>
              <StaggerItem>
                <MotionCard hoverLift>
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">MotionButton (Spring Physics)</h3>
                    <p className="text-sm text-muted-foreground">
                      Botões com spring micro-interactions. Feedback visual imediato.
                    </p>
                    <div className="flex flex-wrap gap-3 bg-muted/30 p-4 rounded-lg">
                      <MotionButton variant="default">
                        Default Button
                      </MotionButton>
                      <MotionButton variant="outline">
                        Outline Button
                      </MotionButton>
                      <MotionButton variant="secondary">
                        Secondary Button
                      </MotionButton>
                      <MotionButton variant="destructive">
                        Delete
                      </MotionButton>
                    </div>
                  </div>
                </MotionCard>
              </StaggerItem>

              <StaggerItem>
                <MotionCard hoverLift>
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Form Micro-Interactions</h3>
                    <p className="text-sm text-muted-foreground">
                      Inputs com feedback visual (error, success).
                    </p>
                    <div className="space-y-4 bg-muted/30 p-4 rounded-lg">
                      <FormField
                        label="Email"
                        hint="Use um email válido"
                      >
                        <Input type="email" placeholder="seu@email.com" />
                      </FormField>
                      <FormField
                        label="Status"
                        success="Dados atualizados!"
                      >
                        <Input placeholder="Campo com sucesso" />
                      </FormField>
                    </div>
                  </div>
                </MotionCard>
              </StaggerItem>
            </Stagger>
          </section>

          {/* Accessibility */}
          <section className="space-y-6">
            <AccessibleHeading level="h2" className="text-3xl">
              ♿ Accessibility (WCAG AAA)
            </AccessibleHeading>

            <Stagger staggerDelay={0.1}>
              <StaggerItem>
                <MotionCard hoverLift>
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">AccessibleButton</h3>
                    <p className="text-sm text-muted-foreground">
                      Botões com aria-label obrigatório para icon-only.
                    </p>
                    <div className="flex flex-wrap gap-3 bg-muted/30 p-4 rounded-lg">
                      <AccessibleButton
                        ariaLabel="Logout"
                        size="icon-lg"
                        variant="outline"
                      >
                        <LogOut className="w-5 h-5" />
                      </AccessibleButton>
                      <AccessibleButton>
                        Botão com texto
                      </AccessibleButton>
                    </div>
                  </div>
                </MotionCard>
              </StaggerItem>
            </Stagger>
          </section>

          {/* Data Visualization */}
          <section className="space-y-6 mb-16">
            <AccessibleHeading level="h2" className="text-3xl">
              📊 Data Visualization
            </AccessibleHeading>

            <Stagger staggerDelay={0.1}>
              <StaggerItem>
                <MotionCard hoverLift>
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Sparklines & Badges</h3>
                    <p className="text-sm text-muted-foreground">
                      Mini gráficos e indicadores de status.
                    </p>
                    <div className="space-y-4 bg-muted/30 p-4 rounded-lg">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Trend Chart
                        </p>
                        <Sparkline
                          data={sparklineData}
                          color="hsl(142 71% 45%)"
                          height={60}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="success">Success</Badge>
                        <Badge variant="warning">Warning</Badge>
                        <Badge variant="error">Error</Badge>
                        <Badge variant="info">Info</Badge>
                      </div>
                    </div>
                  </div>
                </MotionCard>
              </StaggerItem>
            </Stagger>
          </section>
        </div>
      </main>
    </PageTransition>
  );
};

export default ComponentShowcase;
