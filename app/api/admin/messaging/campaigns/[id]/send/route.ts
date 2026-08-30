// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';
import { getProviderClient } from '@/lib/messaging/provider-factory';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Executa o envio da campanha em lote. Limita ao throttlePerMin
 * configurado (ou no provider.maxPerMinute) respeitando lotes.
 * Este handler é síncrono — para grandes volumes recomenda-se
 * paginar via cron/daemon.
 */
export async function POST(req: NextRequest, { params }: any) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const campaign = await prisma.messageCampaign.findFirst({
    where: { id: params.id, restaurantId },
    include: { template: true },
  });
  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
  if (['RUNNING', 'COMPLETED'].includes(campaign.status)) {
    return NextResponse.json({ error: `Campanha já está ${campaign.status}` }, { status: 409 });
  }
  if (campaign.template.status !== 'APPROVED' && campaign.template.status !== 'DRAFT') {
    return NextResponse.json({
      error: `Template ${campaign.template.name} com status ${campaign.template.status}. Somente APPROVED ou DRAFT (envio de teste) podem ser usados.`,
    }, { status: 400 });
  }

  const { client, error } = await getProviderClient(restaurantId, campaign.provider);
  if (!client) return NextResponse.json({ error: error || 'Provider não configurado' }, { status: 400 });

  // Grab PENDING recipients only
  const pending = await prisma.messageCampaignRecipient.findMany({
    where: { campaignId: campaign.id, status: 'PENDING' },
    take: 500, // cap per execution
  });
  if (pending.length === 0) {
    await prisma.messageCampaign.update({
      where: { id: campaign.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return NextResponse.json({ ok: true, sent: 0, failed: 0, total: 0, done: true });
  }

  await prisma.messageCampaign.update({
    where: { id: campaign.id },
    data: { status: 'RUNNING', startedAt: campaign.startedAt || new Date() },
  });

  const tplDef = {
    name: campaign.template.name,
    language: campaign.template.language,
    category: campaign.template.category,
    headerText: campaign.template.headerText,
    bodyText: campaign.template.bodyText,
    footerText: campaign.template.footerText,
    buttons: (campaign.template.buttons as any) || null,
    variables: (campaign.template.variables as any) || [],
  };

  let sent = 0;
  let failed = 0;
  for (const r of pending) {
    const vars = { ...(campaign.defaultVariables as any), ...(r.variables as any) };
    try {
      await prisma.messageCampaignRecipient.update({
        where: { id: r.id },
        data: { status: 'SENDING' },
      });

      const result = await client.sendTemplate({
        to: r.phoneNumber,
        template: tplDef,
        variables: vars,
      });

      if (result.ok) {
        sent++;
        await prisma.messageCampaignRecipient.update({
          where: { id: r.id },
          data: {
            status: 'SENT',
            providerMsgId: result.providerMsgId || null,
            sentAt: new Date(),
          },
        });
      } else {
        failed++;
        await prisma.messageCampaignRecipient.update({
          where: { id: r.id },
          data: {
            status: 'FAILED',
            errorMessage: result.error || 'Erro desconhecido',
            failedAt: new Date(),
          },
        });
      }
    } catch (err: any) {
      failed++;
      await prisma.messageCampaignRecipient.update({
        where: { id: r.id },
        data: { status: 'FAILED', errorMessage: err?.message || 'Erro', failedAt: new Date() },
      });
    }
  }

  // Update campaign totals
  const remainingPending = await prisma.messageCampaignRecipient.count({
    where: { campaignId: campaign.id, status: 'PENDING' },
  });
  const nextStatus = remainingPending > 0 ? 'RUNNING' : failed > 0 && sent > 0 ? 'PARTIALLY_COMPLETED' : failed > 0 ? 'FAILED' : 'COMPLETED';

  await prisma.messageCampaign.update({
    where: { id: campaign.id },
    data: {
      status: nextStatus,
      totalSent: { increment: sent },
      totalFailed: { increment: failed },
      completedAt: remainingPending === 0 ? new Date() : null,
    },
  });

  // Update template stats
  await prisma.messageTemplate.update({
    where: { id: campaign.templateId },
    data: { totalSent: { increment: sent }, lastUsedAt: new Date() },
  });
  // Update provider stats
  if (campaign.provider !== 'META_CLOUD') {
    await prisma.messagingProviderConfig.updateMany({
      where: { restaurantId, provider: campaign.provider },
      data: {
        totalSent: { increment: sent },
        totalFailed: { increment: failed },
        lastUsedAt: new Date(),
      },
    });
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    batchSize: pending.length,
    remaining: remainingPending,
    done: remainingPending === 0,
    nextStatus,
  });
}
