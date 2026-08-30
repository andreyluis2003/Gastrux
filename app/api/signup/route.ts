// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcryptjs from 'bcryptjs';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, acceptedTerms } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email e senha são obrigatórios' },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Usuário já existe' },
        { status: 400 }
      );
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    // Create user as OWNER with auto-provisioned restaurant
    const restaurantName = name ? `Restaurante ${name}` : 'Meu Restaurante';

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || email.split('@')[0],
        role: 'OWNER',
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30-day trial
        acceptedTermsAt: acceptedTerms ? new Date() : null,
      },
    });

    // Auto-provision restaurant
    const restaurant = await prisma.restaurant.create({
      data: {
        name: restaurantName,
        email: email,
        ownerId: user.id,
        status: 'TRIAL',
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Link user to restaurant
    await prisma.restaurantUser.create({
      data: {
        restaurantId: restaurant.id,
        userId: user.id,
        role: 'OWNER',
        permissions: ['ALL'],
        acceptedAt: new Date(),
      },
    });

    // Set current restaurant
    await prisma.user.update({
      where: { id: user.id },
      data: { currentRestaurantId: restaurant.id },
    });

    // Seed default categories for the new restaurant
    const defaultCategories = ['Carnes', 'Vegetais', 'Laticínios', 'Temperos', 'Bebidas', 'Outros'];
    const categoryMap: Record<string, string> = {};
    await Promise.all(
      defaultCategories.map(async (catName) => {
        try {
          const cat = await prisma.ingredientCategory.create({
            data: { name: catName, restaurantId: restaurant.id },
          });
          categoryMap[catName] = cat.id;
        } catch {
          // ignore if duplicates
        }
      })
    );

    // === DEMO SEED DATA ===
    // Seed demo data so the user sees the system working immediately
    try {
      await seedDemoData(restaurant.id, categoryMap);
    } catch (demoErr) {
      console.error('Demo seed data error (non-blocking):', demoErr);
    }

    // Send welcome email asynchronously (fire and forget)
    fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/email/send-welcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
      }),
    }).catch((err) => console.error('Failed to send welcome email:', err));

    return NextResponse.json(
      {
        message: 'Conta criada com sucesso! Seu restaurante já está pronto.',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
        },
        trial: {
          daysRemaining: 30,
          tier: 'starter',
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Erro ao criar usuário' },
      { status: 500 }
    );
  }
}

// ============================================================
// Demo seed data: recipes, ingredients, menu, table with QR code
// ============================================================
async function seedDemoData(restaurantId: string, categoryMap: Record<string, string>) {
  // 1. Create demo ingredients across categories
  const ingredientDefs = [
    { code: 'DEMO-ARR', name: 'Arroz Branco', catKey: 'Outros', unit: 'kg' as const, cost: 6.50 },
    { code: 'DEMO-FEI', name: 'Feijão Carioca', catKey: 'Outros', unit: 'kg' as const, cost: 8.00 },
    { code: 'DEMO-FRG', name: 'Peito de Frango', catKey: 'Carnes', unit: 'kg' as const, cost: 18.00 },
    { code: 'DEMO-TOM', name: 'Tomate', catKey: 'Vegetais', unit: 'kg' as const, cost: 7.50 },
    { code: 'DEMO-CEB', name: 'Cebola', catKey: 'Vegetais', unit: 'kg' as const, cost: 4.00 },
    { code: 'DEMO-ALH', name: 'Alho', catKey: 'Temperos', unit: 'kg' as const, cost: 30.00 },
    { code: 'DEMO-OLE', name: 'Óleo de Soja', catKey: 'Outros', unit: 'l' as const, cost: 7.00 },
    { code: 'DEMO-SAL', name: 'Sal Refinado', catKey: 'Temperos', unit: 'kg' as const, cost: 2.50 },
    { code: 'DEMO-ALF', name: 'Alface Crespa', catKey: 'Vegetais', unit: 'un' as const, cost: 3.00 },
    { code: 'DEMO-LIM', name: 'Limão', catKey: 'Vegetais', unit: 'kg' as const, cost: 5.00 },
    { code: 'DEMO-REF', name: 'Refrigerante Lata', catKey: 'Bebidas', unit: 'un' as const, cost: 3.50 },
    { code: 'DEMO-SUC', name: 'Suco Natural (Laranja)', catKey: 'Bebidas', unit: 'l' as const, cost: 8.00 },
  ];

  const ingredients: Record<string, string> = {};
  for (const def of ingredientDefs) {
    const catId = categoryMap[def.catKey];
    if (!catId) continue;
    const ing = await prisma.ingredient.create({
      data: {
        restaurantId,
        code: def.code,
        name: def.name,
        categoryId: catId,
        standardUnit: def.unit,
        purchaseUnit: def.unit,
        conversionFactor: 1.0,
        minimumStock: 1,
        referenceCost: def.cost,
      },
    });
    ingredients[def.code] = ing.id;
  }

  // 2. Create demo recipes
  const recipeDefs = [
    {
      code: 'DEMO-R01', name: 'Arroz com Feijão',
      description: 'Clássico arroz soltinho com feijão temperado',
      baseYield: 10, yieldUnit: 'un' as const, prepTime: 40, sellingPrice: 12.00,
      items: [
        { code: 'DEMO-ARR', qty: 1, unit: 'kg' as const },
        { code: 'DEMO-FEI', qty: 0.5, unit: 'kg' as const },
        { code: 'DEMO-CEB', qty: 0.1, unit: 'kg' as const },
        { code: 'DEMO-ALH', qty: 0.02, unit: 'kg' as const },
        { code: 'DEMO-OLE', qty: 0.05, unit: 'l' as const },
        { code: 'DEMO-SAL', qty: 0.01, unit: 'kg' as const },
      ],
    },
    {
      code: 'DEMO-R02', name: 'Filé de Frango Grelhado',
      description: 'Peito de frango grelhado com temperos frescos',
      baseYield: 4, yieldUnit: 'un' as const, prepTime: 25, sellingPrice: 28.00,
      items: [
        { code: 'DEMO-FRG', qty: 1, unit: 'kg' as const },
        { code: 'DEMO-ALH', qty: 0.02, unit: 'kg' as const },
        { code: 'DEMO-LIM', qty: 0.1, unit: 'kg' as const },
        { code: 'DEMO-OLE', qty: 0.03, unit: 'l' as const },
        { code: 'DEMO-SAL', qty: 0.01, unit: 'kg' as const },
      ],
    },
    {
      code: 'DEMO-R03', name: 'Salada Mista',
      description: 'Salada fresca com alface, tomate e cebola',
      baseYield: 6, yieldUnit: 'un' as const, prepTime: 10, sellingPrice: 10.00,
      items: [
        { code: 'DEMO-ALF', qty: 2, unit: 'un' as const },
        { code: 'DEMO-TOM', qty: 0.3, unit: 'kg' as const },
        { code: 'DEMO-CEB', qty: 0.1, unit: 'kg' as const },
        { code: 'DEMO-LIM', qty: 0.05, unit: 'kg' as const },
        { code: 'DEMO-OLE', qty: 0.02, unit: 'l' as const },
        { code: 'DEMO-SAL', qty: 0.005, unit: 'kg' as const },
      ],
    },
    {
      code: 'DEMO-R04', name: 'Prato Executivo Completo',
      description: 'Arroz, feijão, filé de frango, salada e farofa',
      baseYield: 1, yieldUnit: 'un' as const, prepTime: 45, sellingPrice: 35.00,
      items: [
        { code: 'DEMO-ARR', qty: 0.15, unit: 'kg' as const },
        { code: 'DEMO-FEI', qty: 0.1, unit: 'kg' as const },
        { code: 'DEMO-FRG', qty: 0.2, unit: 'kg' as const },
        { code: 'DEMO-ALF', qty: 0.5, unit: 'un' as const },
        { code: 'DEMO-TOM', qty: 0.05, unit: 'kg' as const },
        { code: 'DEMO-OLE', qty: 0.02, unit: 'l' as const },
        { code: 'DEMO-SAL', qty: 0.005, unit: 'kg' as const },
      ],
    },
  ];

  const recipeIds: Record<string, string> = {};
  for (const r of recipeDefs) {
    const recipe = await prisma.recipe.create({
      data: {
        restaurantId,
        code: r.code,
        name: r.name,
        description: r.description,
        baseYield: r.baseYield,
        yieldUnit: r.yieldUnit,
        portionSize: 1,
        portionUnit: 'un',
        prepTimeMinutes: r.prepTime,
        sellingPrice: r.sellingPrice,
        ingredients: {
          create: r.items
            .filter((i) => ingredients[i.code])
            .map((i) => ({
              ingredientId: ingredients[i.code],
              quantity: i.qty,
              unit: i.unit,
            })),
        },
      },
    });
    recipeIds[r.code] = recipe.id;
  }

  // 3. Create demo menu categories and items
  const menuCatPratos = await prisma.menuCategory.create({
    data: { restaurantId, name: 'Pratos Principais', emoji: '🍽️', position: 0, active: true },
  });
  const menuCatAcomp = await prisma.menuCategory.create({
    data: { restaurantId, name: 'Acompanhamentos', emoji: '🥗', position: 1, active: true },
  });
  const menuCatBebidas = await prisma.menuCategory.create({
    data: { restaurantId, name: 'Bebidas', emoji: '🥤', position: 2, active: true },
  });

  // Menu items linked to recipes
  await prisma.menuItem.createMany({
    data: [
      {
        categoryId: menuCatPratos.id,
        restaurantId,
        name: 'Prato Executivo Completo',
        description: 'Arroz, feijão, filé de frango grelhado, salada e farofa',
        price: 35.00,
        recipeId: recipeIds['DEMO-R04'] || null,
        position: 0,
      },
      {
        categoryId: menuCatPratos.id,
        restaurantId,
        name: 'Filé de Frango Grelhado',
        description: 'Peito de frango grelhado com ervas finas',
        price: 28.00,
        recipeId: recipeIds['DEMO-R02'] || null,
        position: 1,
      },
      {
        categoryId: menuCatAcomp.id,
        restaurantId,
        name: 'Arroz com Feijão',
        description: 'Porção de arroz soltinho com feijão temperado',
        price: 12.00,
        recipeId: recipeIds['DEMO-R01'] || null,
        position: 0,
      },
      {
        categoryId: menuCatAcomp.id,
        restaurantId,
        name: 'Salada Mista',
        description: 'Alface, tomate e cebola com limão',
        price: 10.00,
        recipeId: recipeIds['DEMO-R03'] || null,
        position: 1,
      },
      {
        categoryId: menuCatBebidas.id,
        restaurantId,
        name: 'Refrigerante Lata',
        description: 'Coca-Cola, Guaraná ou Fanta',
        price: 6.00,
        position: 0,
      },
      {
        categoryId: menuCatBebidas.id,
        restaurantId,
        name: 'Suco Natural de Laranja',
        description: 'Suco feito na hora - 300ml',
        price: 9.00,
        position: 1,
      },
    ],
  });

  // 4. Create demo table section + table with QR code
  const section = await prisma.tableSection.create({
    data: {
      restaurantId,
      name: 'Salão Principal',
      description: 'Área principal do restaurante',
      capacity: 40,
    },
  });

  await prisma.table.create({
    data: {
      restaurantId,
      number: 1,
      sectionId: section.id,
      capacity: 4,
      description: 'Mesa de demonstração',
      qrToken: randomBytes(16).toString('hex'),
    },
  });

  await prisma.table.create({
    data: {
      restaurantId,
      number: 2,
      sectionId: section.id,
      capacity: 6,
      description: 'Mesa para grupos',
      qrToken: randomBytes(16).toString('hex'),
    },
  });
}
