// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface IngredientRow {
  código: string;
  nome: string;
  descrição?: string;
  categoria: string;
  unidade: string;
  unidade_compra: string;
  fator_conversão: string;
  estoque_mínimo: string;
  custo_referência: string;
  fornecedor?: string;
}

interface ParseError {
  row: number;
  field: string;
  value: string;
  error: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is COOK (can't create ingredients)
    if (session.user.role === 'COOK') {
      return NextResponse.json(
        { error: 'Cozinheiros não podem importar insumos' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'Nenhum arquivo foi enviado' },
        { status: 400 }
      );
    }

    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'O arquivo deve ser um CSV' },
        { status: 400 }
      );
    }

    const content = await file.text();
    const lines = content.split('\n').filter((line) => line.trim());

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'O arquivo CSV deve conter cabeçalho e pelo menos 1 linha de dados' },
        { status: 400 }
      );
    }

    // Parse header
    const headers = parseCSVLine(lines[0]);
    const requiredHeaders = ['código', 'nome', 'categoria', 'unidade'];
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

    if (missingHeaders.length > 0) {
      return NextResponse.json(
        {
          error: `Colunas obrigatórias faltando: ${missingHeaders.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Parse rows
    const rows: IngredientRow[] = [];
    const errors: ParseError[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: any = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      rows.push(row);
    }

    // Validate and create ingredients
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as ParseError[],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // +2 because of header and 0-based index

      try {
        // Validate required fields
        if (!row.código || !row.código.trim()) {
          results.errors.push({
            row: rowNumber,
            field: 'código',
            value: row.código,
            error: 'Código é obrigatório',
          });
          results.failed++;
          continue;
        }

        if (!row.nome || !row.nome.trim()) {
          results.errors.push({
            row: rowNumber,
            field: 'nome',
            value: row.nome,
            error: 'Nome é obrigatório',
          });
          results.failed++;
          continue;
        }

        if (!row.categoria || !row.categoria.trim()) {
          results.errors.push({
            row: rowNumber,
            field: 'categoria',
            value: row.categoria,
            error: 'Categoria é obrigatória',
          });
          results.failed++;
          continue;
        }

        // Validate unit
        const validUnits = ['kg', 'g', 'ml', 'l', 'un'];
        if (!row.unidade || !validUnits.includes(row.unidade)) {
          results.errors.push({
            row: rowNumber,
            field: 'unidade',
            value: row.unidade,
            error: `Unidade inválida. Válidas: ${validUnits.join(', ')}`,
          });
          results.failed++;
          continue;
        }

        // Get or create category
        let category = await prisma.ingredientCategory.findUnique({
          where: { name: row.categoria.trim() },
        });

        if (!category) {
          category = await prisma.ingredientCategory.create({
            data: {
              name: row.categoria.trim(),
              color: generateRandomColor(),
            },
          });
        }

        // Parse numeric fields
        const conversionFactor = parseFloat(row.fator_conversão) || 1.0;
        const minimumStock = parseFloat(row.estoque_mínimo) || 0;
        const referenceCost = parseFloat(row.custo_referência) || 0;
        const purchaseUnit = row.unidade_compra || row.unidade;

        // Check if ingredient already exists
        const existingIngredient = await prisma.ingredient.findUnique({
          where: { code: row.código.trim() },
        });

        if (existingIngredient) {
          // Update existing
          await prisma.ingredient.update({
            where: { code: row.código.trim() },
            data: {
              name: row.nome.trim(),
              description: row.descrição?.trim() || null,
              categoryId: category.id,
              standardUnit: row.unidade as any,
              purchaseUnit: purchaseUnit as any,
              conversionFactor,
              minimumStock,
              referenceCost,
            },
          });
        } else {
          // Create new
          const ingredient = await prisma.ingredient.create({
            data: {
              code: row.código.trim(),
              name: row.nome.trim(),
              description: row.descrição?.trim() || null,
              categoryId: category.id,
              standardUnit: row.unidade as any,
              purchaseUnit: purchaseUnit as any,
              conversionFactor,
              minimumStock,
              referenceCost,
            },
          });

          // Create stock entry
          await prisma.stock.create({
            data: {
              ingredientId: ingredient.id,
              currentQuantity: 0,
            },
          });

          // Add supplier if provided
          if (row.fornecedor?.trim()) {
            await prisma.ingredientSupplier.create({
              data: {
                ingredientId: ingredient.id,
                supplierName: row.fornecedor.trim(),
                unitPrice: referenceCost,
              },
            });
          }
        }

        results.successful++;
      } catch (error: any) {
        results.errors.push({
          row: rowNumber,
          field: 'geral',
          value: JSON.stringify(row),
          error: error.message || 'Erro desconhecido ao processar linha',
        });
        results.failed++;
      }
    }

    return NextResponse.json({
      ...results,
      message: `Importação concluída: ${results.successful} insumo(s) criado(s)/atualizado(s), ${results.failed} erro(s)`,
    });
  } catch (error) {
    console.error('CSV import error:', error);
    return NextResponse.json(
      { error: 'Erro ao processar arquivo CSV' },
      { status: 500 }
    );
  }
}

function parseCSVLine(line: string): string[] {
  const result = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function generateRandomColor(): string {
  const colors = [
    '#EF4444',
    '#F97316',
    '#EAB308',
    '#22C55E',
    '#06B6D4',
    '#3B82F6',
    '#8B5CF6',
    '#EC4899',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
