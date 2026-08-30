'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Settings,
  UtensilsCrossed,
  LayoutGrid,
  QrCode,
  ArrowRight,
  X,
  CheckCircle2,
  ExternalLink,
  Loader2,
  PartyPopper,
  ChefHat,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  link: string;
  linkLabel: string;
  icon: string;
  qrToken?: string | null;
}

interface OnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

const STEP_ICONS: Record<string, any> = {
  settings: Settings,
  menu: UtensilsCrossed,
  table: LayoutGrid,
  qr: QrCode,
};

const STEP_COLORS: Record<string, string> = {
  settings: 'bg-blue-500',
  menu: 'bg-purple-500',
  table: 'bg-orange-500',
  qr: 'bg-green-500',
};

export function OnboardingDialog({ open, onOpenChange, onCompleted }: OnboardingDialogProps) {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalSteps, setTotalSteps] = useState(4);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const router = useRouter();

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/progress');
      if (!res.ok) return;
      const data = await res.json();
      setSteps(data.steps || []);
      setCompletedCount(data.completedCount || 0);
      setTotalSteps(data.totalSteps || 4);
    } catch (err) {
      console.error('Failed to fetch onboarding progress:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchProgress();
    }
  }, [open, fetchProgress]);

  const handleSkip = async () => {
    setActionLoading(true);
    try {
      const response = await fetch('/api/onboarding/skip', { method: 'POST' });
      if (response.ok) {
        toast.success('Onboarding pulado. Você pode retomar depois!');
        onOpenChange(false);
      } else {
        toast.error('Erro ao pular onboarding');
      }
    } catch {
      toast.error('Erro ao pular onboarding');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    setActionLoading(true);
    try {
      const response = await fetch('/api/onboarding/complete', { method: 'POST' });
      if (response.ok) {
        toast.success('Parabéns! Onboarding concluído!');
        onOpenChange(false);
        onCompleted?.();
      } else {
        toast.error('Erro ao concluir onboarding');
      }
    } catch {
      toast.error('Erro ao concluir onboarding');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGoToStep = (link: string) => {
    onOpenChange(false);
    router.push(link);
  };

  const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;
  const allCompleted = completedCount === totalSteps && totalSteps > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ChefHat className="w-6 h-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">Configuração Inicial</DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {allCompleted
                    ? 'Tudo pronto! Seu restaurante está configurado.'
                    : `${completedCount} de ${totalSteps} etapas concluídas`}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSkip}
              disabled={actionLoading}
              title="Pular onboarding"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          <div className="mt-4">
            <Progress value={progress} className="h-2" />
          </div>
        </DialogHeader>

        <div className="py-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : allCompleted ? (
            <div className="text-center py-8 space-y-4">
              <div className="flex justify-center">
                <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-full">
                  <PartyPopper className="w-12 h-12 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Excelente! Tudo configurado! 🎉</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Seu restaurante está pronto para operar. Explore o painel para gerenciar pedidos, estoque e muito mais.
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Siga os passos abaixo para configurar seu restaurante. Dados de demonstração já foram criados para você explorar!
              </p>
              {steps.map((step, index) => {
                const IconComponent = STEP_ICONS[step.icon] || Settings;
                const colorClass = STEP_COLORS[step.icon] || 'bg-gray-500';

                return (
                  <div
                    key={step.id}
                    className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                      step.completed
                        ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                        : 'bg-card border-border hover:border-primary/30'
                    }`}
                  >
                    {/* Step number / check */}
                    <div className="flex-shrink-0 mt-0.5">
                      {step.completed ? (
                        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        </div>
                      ) : (
                        <div className={`w-8 h-8 rounded-full ${colorClass} flex items-center justify-center`}>
                          <span className="text-white text-sm font-bold">{index + 1}</span>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <IconComponent className={`w-4 h-4 ${step.completed ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                        <h4 className={`font-semibold text-sm ${step.completed ? 'text-green-700 dark:text-green-300' : ''}`}>
                          {step.title}
                        </h4>
                      </div>
                      <p className={`text-xs mt-1 ${step.completed ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                        {step.description}
                      </p>
                    </div>

                    {/* Action */}
                    <div className="flex-shrink-0">
                      <Button
                        variant={step.completed ? 'ghost' : 'default'}
                        size="sm"
                        onClick={() => handleGoToStep(step.link)}
                        className="gap-1.5 text-xs"
                      >
                        {step.linkLabel}
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="flex gap-3 justify-between border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSkip}
            disabled={actionLoading}
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Pular por agora
          </Button>
          {allCompleted ? (
            <Button
              onClick={handleComplete}
              disabled={actionLoading}
              className="gap-2"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Concluir
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchProgress()}
              className="gap-1.5"
            >
              Atualizar progresso
              <ArrowRight className="w-3 h-3" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
