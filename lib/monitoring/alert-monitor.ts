// @ts-nocheck
/**
 * Monitoramento de KPIs com Alertas
 * Verifica thresholds e envia notificações ao admin
 */

import {
  calculateMRR,
  calculateChurnRate,
} from './kpi-calculations';
import {
  alertMRRDrop,
  alertHighChurnRate,
} from '@/lib/admin-alerts';
import { prisma } from '@/lib/prisma';

const ALERT_THRESHOLDS = {
  MRR_DROP_PERCENTAGE: 10, // Alerta se MRR cai mais de 10%
  CHURN_RATE_PERCENTAGE: 5, // Alerta se churn > 5%
};

/**
 * Monitora KPIs e envia alertas se necessario
 * Deve ser chamada periodicamente (ex: daemon task)
 */
export async function monitorKPIsAndAlert() {
  try {
    console.log('[Monitor] Iniciando verificação de KPIs...');

    // Calcula MRR e verifica queda
    const mrrData = await calculateMRR();
    if (mrrData.mrrPreviousMonth > 0) {
      const mrrDropPercentage = Math.abs(mrrData.trend);
      if (mrrData.trend < -ALERT_THRESHOLDS.MRR_DROP_PERCENTAGE) {
        console.log(`[Alert] MRR queda detectada: ${mrrDropPercentage.toFixed(2)}%`);
        await alertMRRDrop(
          mrrData.mrr,
          mrrData.mrrPreviousMonth,
          mrrDropPercentage
        );
      }
    }

    // Calcula Churn Rate e verifica threshold
    const churnData = await calculateChurnRate();
    if (churnData.churnRate > ALERT_THRESHOLDS.CHURN_RATE_PERCENTAGE) {
      console.log(`[Alert] Churn rate elevada: ${churnData.churnRate.toFixed(2)}%`);
      await alertHighChurnRate(
        churnData.churnRate,
        churnData.cancelledCount
      );
    }

    console.log('[Monitor] Verificação concluída');
    return {
      success: true,
      mrrDropDetected: mrrData.trend < -ALERT_THRESHOLDS.MRR_DROP_PERCENTAGE,
      highChurnDetected: churnData.churnRate > ALERT_THRESHOLDS.CHURN_RATE_PERCENTAGE,
    };
  } catch (error) {
    console.error('[Monitor] Erro durante verificação:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Verifica e salva o timestamp da última verificação
 */
export async function getLastMonitoringCheckTime(): Promise<Date | null> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'LAST_KPI_MONITOR_CHECK' },
    });

    return setting ? new Date(setting.value) : null;
  } catch {
    return null;
  }
}

/**
 * Atualiza o timestamp da última verificação
 */
export async function updateLastMonitoringCheckTime(): Promise<void> {
  try {
    await prisma.systemSetting.upsert({
      where: { key: 'LAST_KPI_MONITOR_CHECK' },
      update: { value: new Date().toISOString() },
      create: { key: 'LAST_KPI_MONITOR_CHECK', value: new Date().toISOString() },
    });
  } catch (error) {
    console.error('Error updating monitoring check time:', error);
  }
}
