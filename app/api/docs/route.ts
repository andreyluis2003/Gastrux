// @ts-nocheck
import { NextResponse } from 'next/server';
import { getApiDocs } from '@/lib/swagger';

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/docs:
 *   get:
 *     tags:
 *       - Docs
 *     summary: Obter especificação OpenAPI
 *     description: Retorna a documentação completa da API em formato OpenAPI 3.0
 *     responses:
 *       200:
 *         description: Especificação OpenAPI em JSON
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
export async function GET() {
  try {
    const spec = getApiDocs();
    return NextResponse.json(spec);
  } catch (error) {
    console.error('[API Docs] Error generating spec:', error);
    return NextResponse.json(
      { error: 'Failed to generate API documentation' },
      { status: 500 }
    );
  }
}
