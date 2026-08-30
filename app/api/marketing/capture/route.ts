// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateLeadScore } from '@/lib/marketing/lead-scoring';

export const dynamic = 'force-dynamic';

/**
 * Público: captura leads de landing pages, segmentos e campanhas PPC.
 * POST { source, name?, email?, phoneNumber?, businessName?, segment?, utm* }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      source = 'LANDING_PAGE',
      sourceDetail,
      name,
      email,
      phoneNumber,
      businessName,
      segment,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      metadata,
    } = body;

    // Pelo menos um contato
    if (!email && !phoneNumber) {
      return NextResponse.json({ error: 'Informe email ou telefone' }, { status: 400 });
    }

    // Verificar duplicata por email ou phone
    const existing = await prisma.marketingLead.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phoneNumber ? [{ phoneNumber }] : []),
        ],
      },
    });

    if (existing) {
      // Atualiza score e metadata se já existe
      const newScore = calculateLeadScore({
        source: existing.source,
        hasPhone: !!(existing.phoneNumber || phoneNumber),
        hasEmail: !!(existing.email || email),
        hasBusinessName: !!(existing.businessName || businessName),
        segment: existing.segment || segment,
        utmCampaign: existing.utmCampaign || utmCampaign,
        contactAttempts: existing.contactAttempts,
        metadata: { ...(existing.metadata as any || {}), ...(metadata || {}) },
      });

      const updated = await prisma.marketingLead.update({
        where: { id: existing.id },
        data: {
          score: Math.max(existing.score, newScore),
          ...(name && !existing.name ? { name } : {}),
          ...(businessName && !existing.businessName ? { businessName } : {}),
          ...(segment && !existing.segment ? { segment } : {}),
          ...(email && !existing.email ? { email } : {}),
          ...(phoneNumber && !existing.phoneNumber ? { phoneNumber } : {}),
        },
      });
      return NextResponse.json({ lead: updated, isNew: false });
    }

    const score = calculateLeadScore({
      source,
      hasPhone: !!phoneNumber,
      hasEmail: !!email,
      hasBusinessName: !!businessName,
      segment,
      utmCampaign,
      metadata,
    });

    const lead = await prisma.marketingLead.create({
      data: {
        source,
        sourceDetail,
        name,
        email,
        phoneNumber,
        businessName,
        segment,
        score,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        metadata: metadata || {},
      },
    });

    return NextResponse.json({ lead, isNew: true }, { status: 201 });
  } catch (err: any) {
    console.error('[lead-capture] error:', err?.message || err);
    return NextResponse.json({ error: 'Erro ao capturar lead' }, { status: 500 });
  }
}
