// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nfe/config
 * Retrieve NF-e/NFC-e configuration
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const config = await prisma.nFeConfig.findFirst();
    if (!config) {
      return NextResponse.json(
        { error: 'NF-e configuration not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error fetching NF-e config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch configuration' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/nfe/config
 * Create or update NF-e/NFC-e configuration
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Unauthorized - only owner can configure' },
        { status: 401 }
      );
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const body = await request.json();
    const {
      cnpj,
      stateRegistration,
      municipalRegistration,
      nfeProvider,
      nfeApiKey,
      seriesNFe,
      seriesNFCe,
      environment,
      uf,
      contingencyMode,
      issueNFCeForCPF,
      issueNFeForCNPJ,
    } = body;

    // Validate required fields
    if (!cnpj || !nfeProvider) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: cnpj, nfeProvider' },
        { status: 400 }
      );
    }

    // Check if config already exists
    const existingConfig = await prisma.nFeConfig.findFirst();

    if (existingConfig) {
      const data: any = {
        cnpj,
        stateRegistration,
        municipalRegistration,
        nfeProvider,
        seriesNFe: seriesNFe || existingConfig.seriesNFe,
        seriesNFCe: seriesNFCe || existingConfig.seriesNFCe,
        environment: environment || 'sandbox',
        uf: uf || (existingConfig as any).uf || 'SP',
        contingencyMode: contingencyMode ?? (existingConfig as any).contingencyMode ?? false,
        issueNFCeForCPF: issueNFCeForCPF ?? existingConfig.issueNFCeForCPF,
        issueNFeForCNPJ: issueNFeForCNPJ ?? existingConfig.issueNFeForCNPJ,
      };
      if (nfeApiKey) data.nfeApiKey = nfeApiKey;
      const updated = await prisma.nFeConfig.update({
        where: { id: existingConfig.id },
          restaurantId,
      });
      return NextResponse.json(updated);
    } else {
      if (!nfeApiKey) {
        return NextResponse.json(
          { error: 'API Key (nfeApiKey) obrigatória para criar configuração' },
          { status: 400 }
        );
      }
      const config = await prisma.nFeConfig.create({
        data: {
          cnpj,
          stateRegistration,
          municipalRegistration,
          nfeProvider,
          nfeApiKey,
          seriesNFe: seriesNFe || 1,
          seriesNFCe: seriesNFCe || 1,
          environment: environment || 'sandbox',
          uf: uf || 'SP',
          contingencyMode: contingencyMode ?? false,
          issueNFCeForCPF: issueNFCeForCPF ?? true,
          issueNFeForCNPJ: issueNFeForCNPJ ?? true,
        } as any,
      });
      return NextResponse.json(config, { status: 201 });
    }
  } catch (error) {
    console.error('Error creating/updating NF-e config:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    );
  }
}
