// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

const TIMEZONES_BR = [
  'America/Sao_Paulo',
  'America/Bahia',
  'America/Belem',
  'America/Manaus',
  'America/Cuiaba',
  'America/Fortaleza',
  'America/Recife',
  'America/Porto_Velho',
  'America/Rio_Branco',
  'America/Araguaina',
  'America/Noronha',
];

const STATES_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
];

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      name: true,
      cnpj: true,
      email: true,
      phone: true,
      website: true,
      address: true,
      city: true,
      state: true,
      country: true,
      zipCode: true,
      timezone: true,
      currency: true,
      language: true,
      logoUrl: true,
      businessHours: true,
      status: true,
      subscriptionTier: true,
      createdAt: true,
    },
  });

  if (!restaurant) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  return NextResponse.json({ restaurant, timezones: TIMEZONES_BR, states: STATES_BR });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const body = await request.json();

  // Only allow updating specific fields
  const allowedFields = [
    'name', 'cnpj', 'email', 'phone', 'website',
    'address', 'city', 'state', 'zipCode',
    'timezone', 'currency', 'language', 'logoUrl', 'businessHours'
  ];

  const updateData: Record<string, any> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      let value = body[field];
      // Normalize empty strings to null for nullable/unique fields to avoid
      // unique-constraint collisions (e.g. cnpj is @unique: two restaurants
      // saving an empty cnpj '' would violate the constraint -> intermittent 500).
      if (typeof value === 'string' && value.trim() === '') {
        value = null;
      }
      updateData[field] = value;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
  }

  // Validate CNPJ format if provided (basic)
  if (updateData.cnpj && updateData.cnpj.replace(/\D/g, '').length !== 14) {
    return NextResponse.json({ error: 'CNPJ deve ter 14 dígitos' }, { status: 400 });
  }

  // Validate timezone
  if (updateData.timezone && !TIMEZONES_BR.includes(updateData.timezone)) {
    return NextResponse.json({ error: 'Fuso horário inválido' }, { status: 400 });
  }

  try {
    const updated = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: updateData,
      select: {
        id: true,
        name: true,
        cnpj: true,
        email: true,
        phone: true,
        website: true,
        address: true,
        city: true,
        state: true,
        country: true,
        zipCode: true,
        timezone: true,
        currency: true,
        language: true,
        logoUrl: true,
        businessHours: true,
        status: true,
        subscriptionTier: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ restaurant: updated });
  } catch (error: any) {
    console.error('Error updating restaurant settings:', error);
    // Unique constraint violation (e.g. CNPJ already used by another restaurant)
    if (error?.code === 'P2002') {
      const target = Array.isArray(error?.meta?.target) ? error.meta.target.join(', ') : (error?.meta?.target || '');
      const friendly = String(target).includes('cnpj')
        ? 'Este CNPJ já está cadastrado em outro restaurante.'
        : 'Já existe um registro com um destes valores. Verifique os campos únicos.';
      return NextResponse.json({ error: friendly }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'Erro ao salvar configurações. Tente novamente.' },
      { status: 500 }
    );
  }
}
