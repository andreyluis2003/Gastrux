// @ts-nocheck
import { prisma } from '../lib/prisma';
import bcryptjs from 'bcryptjs';
import { Decimal } from '@prisma/client/runtime/library';
import { OrderType, OrderStatus, OrderPriority } from '@prisma/client';

async function main() {
  console.log('🌱 Starting seed...');

  // Create test user
  const testUser = await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: {
      email: 'john@doe.com',
      password: await bcryptjs.hash('johndoe123', 10),
      name: 'John Doe',
      role: 'OWNER',
    },
  });
  console.log('✓ Test user created/updated:', testUser.email);

  // ============== Create Restaurant (Multi-Tenancy) ==============
  console.log('🏪 Seeding restaurant...');
  const restaurant = await prisma.restaurant.upsert({
    where: { cnpj: '12345678000190' },
    update: {},
    create: {
      name: 'Meu Restaurante',
      cnpj: '12345678000190',
      email: 'contato@restaurant.com',
      phone: '(11) 3000-0000',
      address: 'Rua Principal, 123',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310-100',
      country: 'BR',
      timezone: 'America/Sao_Paulo',
      status: 'ACTIVE',
      subscriptionStatus: 'active',
      ownerId: testUser.id,
    },
  });
  console.log('✓ Restaurant created:', restaurant.name);

  // Link the test user to the restaurant they own
  if (testUser.currentRestaurantId !== restaurant.id) {
    await prisma.user.update({
      where: { id: testUser.id },
      data: { currentRestaurantId: restaurant.id },
    });
  }
  console.log('✓ Test user linked to restaurant (currentRestaurantId set)');

  // Create default ingredient categories
  const categories = [
    { name: 'Proteína', color: '#ef4444' },
    { name: 'Grãos', color: '#f59e0b' },
    { name: 'Vegetais', color: '#10b981' },
    { name: 'Temperos', color: '#8b5cf6' },
    { name: 'Laticínios', color: '#f3f4f6' },
    { name: 'Óleos e Gorduras', color: '#f97316' },
    { name: 'Bebidas', color: '#06b6d4' },
  ];

  for (const cat of categories) {
    await prisma.ingredientCategory.upsert({
      where: { 
        restaurantId_name: {
          restaurantId: restaurant.id,
          name: cat.name
        }
      },
      update: {},
      create: {
        restaurantId: restaurant.id,
        ...cat
      },
    });
  }
  console.log('✓ Default ingredient categories created');

  // Seed Recipes with Ingredients
  console.log('📋 Seeding recipes...');
  
  // First, let's get some ingredients that already exist
  const proteináCategory = await prisma.ingredientCategory.findUnique({
    where: { 
      restaurantId_name: {
        restaurantId: restaurant.id,
        name: 'Proteína'
      }
    },
  });

  const grãosCategory = await prisma.ingredientCategory.findUnique({
    where: { 
      restaurantId_name: {
        restaurantId: restaurant.id,
        name: 'Grãos'
      }
    },
  });

  const vegetaisCategory = await prisma.ingredientCategory.findUnique({
    where: { 
      restaurantId_name: {
        restaurantId: restaurant.id,
        name: 'Vegetais'
      }
    },
  });

  // Create recipes
  const recipes = [
    {
      code: 'RECIPE001',
      name: 'Filé de Frango à Parmegiana',
      description: 'Filé de frango empanado, coberto com molho de tomate e queijo',
      baseYield: 4,
      yieldUnit: 'un' as const,
      portionSize: 1,
      portionUnit: 'un' as const,
      prepTimeMinutes: 45,
      yieldLossFactor: 0.95,
    },
    {
      code: 'RECIPE002',
      name: 'Arroz e Feijão Integral',
      description: 'Acompanhamento clássico, saudável e nutritivo',
      baseYield: 8,
      yieldUnit: 'un' as const,
      portionSize: 1,
      portionUnit: 'un' as const,
      prepTimeMinutes: 30,
      yieldLossFactor: 0.92,
    },
    {
      code: 'RECIPE003',
      name: 'Salada Verde com Tomate',
      description: 'Salada fresca com vegetais da estação',
      baseYield: 6,
      yieldUnit: 'un' as const,
      portionSize: 1,
      portionUnit: 'un' as const,
      prepTimeMinutes: 15,
      yieldLossFactor: 0.98,
    },
  ];

  const createdRecipes = [];
  for (const recipe of recipes) {
    const created = await prisma.recipe.upsert({
      where: { 
        restaurantId_code: {
          restaurantId: restaurant.id,
          code: recipe.code
        }
      },
      update: {
        name: recipe.name,
        description: recipe.description,
        baseYield: recipe.baseYield,
        yieldUnit: recipe.yieldUnit,
        portionSize: recipe.portionSize,
        portionUnit: recipe.portionUnit,
        prepTimeMinutes: recipe.prepTimeMinutes,
        yieldLossFactor: recipe.yieldLossFactor,
      },
      create: {
        restaurantId: restaurant.id,
        ...recipe
      },
    });
    createdRecipes.push(created);
  }
  console.log(`✓ ${createdRecipes.length} recipes created`);

  // Seed Price Trends (last 30 days)
  console.log('💰 Seeding price trends...');
  
  const existingIngredients = await prisma.ingredient.findMany({
    take: 10,
  });

  // Create price trends for each ingredient (simulating price history)
  const now = new Date();
  for (const ingredient of existingIngredients) {
    // Create price trend entries for the last 30 days
    for (let i = 30; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      // Simulate price variations
      const basePrice = Number(ingredient.referenceCost || 10);
      const variance = (Math.sin(i / 5) * 0.1 + Math.random() * 0.05) * basePrice;
      const price = parseFloat((basePrice + variance).toFixed(2));

      // Just create the price trend (don't upsert)
      await prisma.priceTrend.create({
        data: {
          ingredientId: ingredient.id,
          price,
          recordedDate: date,
          source: 'MANUAL',
        },
      }).catch(() => {
        // Silently ignore duplicates
      });
    }
  }
  console.log(`✓ Price trends created for ${existingIngredients.length} ingredients`);

  // Seed Stock Movements (consumption data for last 30 days)
  console.log('📊 Seeding stock movements...');
  
  for (const ingredient of existingIngredients) {
    // Create varied stock movements throughout the month
    for (let i = 30; i > 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      // Vary quantity based on day of week (more on weekends)
      const dayOfWeek = date.getDay();
      const baseQuantity = dayOfWeek === 5 || dayOfWeek === 6 ? 15 : dayOfWeek === 0 ? 10 : 5;
      const quantity = baseQuantity + Math.random() * 5;

      // Only create movements 60% of the time to make it realistic
      if (Math.random() < 0.6) {
        await prisma.stockMovement.create({
          data: {
            restaurantId: restaurant.id,
            ingredientId: ingredient.id,
            quantity,
            movementType: 'MANUAL_DEDUCTION',
            reason: `Consumo - ${ingredient.name}`,
            createdAt: date,
          },
        });
      }
    }
  }
  console.log(`✓ Stock movements created`);

  // Seed Production Plans
  console.log('📅 Seeding production plans...');
  
  for (let i = 7; i > 0; i--) {
    const planDate = new Date(now);
    planDate.setDate(planDate.getDate() - i);

    const plan = await prisma.productionPlan.create({
      data: {
        restaurantId: restaurant.id,
        planDate,
        notes: `Plano de produção para ${planDate.toLocaleDateString('pt-BR')}`,
        items: {
          create: createdRecipes.slice(0, 2).map((recipe, idx) => ({
            restaurantId: restaurant.id,
            recipeId: recipe.id,
            quantity: 4 + idx * 2,
            estimatedCost: (50 + idx * 20) * (4 + idx * 2),
            notes: `Produzir ${4 + idx * 2} unidades`,
          })),
        },
      },
    });
  }
  console.log(`✓ Production plans created`);

  // Link recipes to ingredients (create recipe ingredients)
  console.log('🔗 Linking recipes to ingredients...');
  
  if (createdRecipes.length > 0) {
    const firstRecipe = createdRecipes[0];
    const ingredientsToLink = existingIngredients.slice(0, 3);

    for (let idx = 0; idx < ingredientsToLink.length; idx++) {
      const ingredient = ingredientsToLink[idx];
      await prisma.recipeIngredient.upsert({
        where: {
          recipeId_ingredientId: {
            recipeId: firstRecipe.id,
            ingredientId: ingredient.id,
          },
        },
        update: {},
        create: {
          recipeId: firstRecipe.id,
          ingredientId: ingredient.id,
          quantity: 100 + idx * 50,
          unit: ingredient.standardUnit || 'g',
        },
      });
    }
  }
  console.log(`✓ Recipe ingredients linked`);

  // Seed Customers (CRM)
  console.log('👥 Seeding customers...');
  
  const customers = [
    {
      name: 'Maria Silva',
      email: 'maria.silva@email.com',
      phone: '(11) 98765-4321',
      city: 'São Paulo',
      state: 'SP',
      totalSpent: new Decimal('2500.00'),
      totalOrders: 8,
      segment: 'VIP',
    },
    {
      name: 'João Santos',
      email: 'joao.santos@email.com',
      phone: '(11) 98765-4322',
      city: 'São Paulo',
      state: 'SP',
      totalSpent: new Decimal('1200.00'),
      totalOrders: 5,
      segment: 'REGULAR',
    },
    {
      name: 'Ana Costa',
      email: 'ana.costa@email.com',
      phone: '(11) 98765-4323',
      city: 'São Paulo',
      state: 'SP',
      totalSpent: new Decimal('450.00'),
      totalOrders: 2,
      segment: 'OCCASIONAL',
    },
    {
      name: 'Carlos Oliveira',
      email: 'carlos.oliveira@email.com',
      phone: '(11) 98765-4324',
      city: 'São Paulo',
      state: 'SP',
      totalSpent: new Decimal('3200.00'),
      totalOrders: 12,
      segment: 'VIP',
    },
  ];

  const createdCustomers = [];
  for (const customer of customers) {
    const created = await prisma.customer.upsert({
      where: { email: customer.email },
      update: {},
      create: {
        ...customer,
        restaurantId: restaurant.id,
        lastOrderAt: new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        averageTicket: customer.totalSpent.div(customer.totalOrders),
      },
    });
    createdCustomers.push(created);
  }
  console.log(`✓ ${createdCustomers.length} customers created`);

  // Seed Loyalty Program
  console.log('🎁 Seeding loyalty program...');
  
  const loyaltyProgram = await prisma.loyaltyProgram.upsert({
    where: { id: 'default-program' },
    update: {},
    create: {
      id: 'default-program',
      name: 'Programa de Fidelização Premium',
      description: 'Programa de pontos para clientes frequentes com recompensas exclusivas',
      active: true,
      pointsPerReal: new Decimal('1'),
      minPointsToRedeem: 100,
      pointsExpiryMonths: 12,
    },
  });
  console.log('✓ Loyalty program created');

  // Create Loyalty Accounts for customers
  console.log('💳 Seeding customer loyalty accounts...');
  
  for (const customer of createdCustomers) {
    // Determine tier based on segment
    const tierMap: { [key: string]: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' } = {
      'VIP': 'PLATINUM',
      'REGULAR': 'SILVER',
      'OCCASIONAL': 'BRONZE',
    };
    
    const tier = tierMap[customer.segment || 'OCCASIONAL'] || 'BRONZE';
    const points = tier === 'PLATINUM' ? 1500 : tier === 'SILVER' ? 800 : 300;

    await prisma.customerLoyaltyAccount.upsert({
      where: {
        customerId_programId: {
          customerId: customer.id,
          programId: loyaltyProgram.id,
        },
      },
      update: {},
      create: {
        customerId: customer.id,
        programId: loyaltyProgram.id,
        currentPoints: points,
        totalPointsEarned: points,
        totalPointsRedeemed: 0,
        tier,
        active: true,
        joinedAt: new Date(now.getTime() - Math.random() * 90 * 24 * 60 * 60 * 1000),
      },
    });
  }
  console.log(`✓ Loyalty accounts created for ${createdCustomers.length} customers`);

  // Seed Loyalty Rewards
  console.log('🏆 Seeding loyalty rewards...');
  
  const rewards = [
    {
      name: 'Desconto 10%',
      description: 'Desconto de 10% na próxima compra',
      pointsCost: 100,
      type: 'DISCOUNT' as const,
      value: new Decimal('0.10'),
      maxRedemptions: null,
    },
    {
      name: 'Prato Grátis',
      description: 'Um prato grátis do cardápio',
      pointsCost: 250,
      type: 'FREE_ITEM' as const,
      value: new Decimal('45.00'),
      maxRedemptions: null,
    },
    {
      name: 'Entrega Grátis',
      description: 'Frete grátis na próxima entrega',
      pointsCost: 150,
      type: 'FREE_DELIVERY' as const,
      value: new Decimal('15.00'),
      maxRedemptions: 10,
    },
    {
      name: 'Upgrade para Prato Premium',
      description: 'Upgrade para um prato premium',
      pointsCost: 200,
      type: 'UPGRADE' as const,
      value: new Decimal('20.00'),
      maxRedemptions: null,
    },
  ];

  const createdRewards = [];
  for (let idx = 0; idx < rewards.length; idx++) {
    const reward = rewards[idx];
    // Deterministic id keyed on the program + index so re-running the seed
    // updates the existing reward instead of creating duplicates.
    const rewardId = `${loyaltyProgram.id}-reward-${idx}`;
    const created = await prisma.loyaltyReward.upsert({
      where: { id: rewardId },
      update: {
        programId: loyaltyProgram.id,
        name: reward.name,
        description: reward.description,
        pointsCost: reward.pointsCost,
        type: reward.type,
        value: reward.value,
        active: true,
        maxRedemptions: reward.maxRedemptions,
      },
      create: {
        id: rewardId,
        programId: loyaltyProgram.id,
        name: reward.name,
        description: reward.description,
        pointsCost: reward.pointsCost,
        type: reward.type,
        value: reward.value,
        active: true,
        maxRedemptions: reward.maxRedemptions,
        validFrom: now,
        validUntil: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      },
    });
    createdRewards.push(created);
  }
  console.log(`✓ ${createdRewards.length} loyalty rewards created`);

  // ============== ADMIN SYSTEM - Staff Members ==============
  console.log('👥 Seeding staff members...');
  
  // Create users for different staff roles
  const managerUser = await prisma.user.upsert({
    where: { email: 'manager@restaurant.com' },
    update: {},
    create: {
      email: 'manager@restaurant.com',
      password: await bcryptjs.hash('manager123', 10),
      name: 'Manager User',
      role: 'MANAGER',
    },
  });

  const cashierUser = await prisma.user.upsert({
    where: { email: 'cashier@restaurant.com' },
    update: {},
    create: {
      email: 'cashier@restaurant.com',
      password: await bcryptjs.hash('cashier123', 10),
      name: 'Cashier User',
      role: 'CASHIER',
    },
  });

  const cookUser = await prisma.user.upsert({
    where: { email: 'cook@restaurant.com' },
    update: {},
    create: {
      email: 'cook@restaurant.com',
      password: await bcryptjs.hash('cook123', 10),
      name: 'Cook User',
      role: 'COOK',
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@restaurant.com' },
    update: {},
    create: {
      email: 'admin@restaurant.com',
      password: await bcryptjs.hash('admin123', 10),
      name: 'Admin User',
      role: 'ADMIN',
    },
  });

  // Create StaffMembers
  const staffMembers = [
    {
      user: managerUser,
      cpf: '12345678901',
      phone: '(11) 99999-0001',
      role: 'MANAGER' as const,
      baseSalary: new Decimal('3500.00'),
      commissionValue: new Decimal('5.00'),
    },
    {
      user: cashierUser,
      cpf: '12345678902',
      phone: '(11) 99999-0002',
      role: 'CASHIER' as const,
      baseSalary: new Decimal('2500.00'),
      commissionValue: new Decimal('2.00'),
    },
    {
      user: cookUser,
      cpf: '12345678903',
      phone: '(11) 99999-0003',
      role: 'COOK' as const,
      baseSalary: new Decimal('2800.00'),
      commissionValue: new Decimal('0.50'),
    },
    {
      user: adminUser,
      cpf: '12345678904',
      phone: '(11) 99999-0004',
      role: 'ADMIN' as const,
      baseSalary: new Decimal('4000.00'),
      commissionValue: new Decimal('0.00'),
    },
  ];

  const createdStaffMembers = [];
  for (const staff of staffMembers) {
    const created = await prisma.staffMember.upsert({
      where: { userId: staff.user.id },
      update: {},
      create: {
        restaurantId: restaurant.id,
        userId: staff.user.id,
        cpf: staff.cpf,
        phone: staff.phone,
        role: staff.role,
        status: 'ACTIVE',
        defaultStartTime: '08:00',
        defaultEndTime: '18:00',
        basesalary: staff.baseSalary,
        commissionType: 'PERCENTAGE',
        commissionValue: staff.commissionValue,
      },
    });
    createdStaffMembers.push(created);
  }
  console.log(`✓ ${createdStaffMembers.length} staff members created`);

  // ============== Create Staff Shifts ==============
  console.log('📅 Seeding staff shifts...');
  const today = new Date();
  let shiftCount = 0;

  for (const staff of createdStaffMembers) {
    // Create shifts for next 7 days
    for (let i = 0; i < 7; i++) {
      const shiftDate = new Date(today);
      shiftDate.setDate(shiftDate.getDate() + i);

      // Skip Sundays
      if (shiftDate.getDay() === 0) continue;

      await prisma.staffShift.upsert({
        where: {
          staffMemberId_shiftDate: {
            staffMemberId: staff.id,
            shiftDate: shiftDate,
          },
        },
        update: {},
        create: {
          staffMemberId: staff.id,
          shiftDate: shiftDate,
          startTime: '08:00',
          endTime: '18:00',
          shiftType: 'NORMAL',
        },
      });
      shiftCount++;
    }
  }
  console.log(`✓ ${shiftCount} staff shifts created`);

  // ============== Create Staff Commissions ==============
  console.log('💰 Seeding staff commissions...');
  const currentMonth = new Date();
  currentMonth.setDate(1); // First day of month

  for (const staff of createdStaffMembers) {
    await prisma.staffCommission.upsert({
      where: {
        staffMemberId_period: {
          staffMemberId: staff.id,
          period: currentMonth,
        },
      },
      update: {},
      create: {
        staffMemberId: staff.id,
        period: currentMonth,
        totalSales: new Decimal(Math.random() * 10000),
        commissionEarned: new Decimal(Math.random() * 500),
        bonusEarned: new Decimal(0),
        totalEarned: new Decimal(Math.random() * 500),
        status: 'PENDING',
      },
    });
  }
  console.log(`✓ ${createdStaffMembers.length} staff commissions created`);

// Restaurant already created above (multi-tenancy section)

  // ============== Create Metric Snapshots ==============
  console.log('📊 Seeding metric snapshots...');
  for (let i = 0; i < 7; i++) {
    const snapshotDate = new Date();
    snapshotDate.setDate(snapshotDate.getDate() - i);

    await prisma.metricSnapshot.upsert({
      where: {
        snapshotDate: snapshotDate,
      },
      update: {},
      create: {
        snapshotDate: snapshotDate,
        totalRevenue: new Decimal(Math.random() * 5000),
        totalCost: new Decimal(Math.random() * 2000),
        totalOrders: Math.floor(Math.random() * 50),
        averageTicket: new Decimal(Math.random() * 200),
        profitMargin: new Decimal(Math.random() * 50),
        newCustomers: Math.floor(Math.random() * 10),
        returningCustomers: Math.floor(Math.random() * 20),
        totalStaffWorking: Math.floor(Math.random() * 5) + 2,
        averagePrepTime: Math.floor(Math.random() * 900) + 300,
        ingredientsLowStock: Math.floor(Math.random() * 5),
      },
    });
  }
  console.log('✓ 7 metric snapshots created');

  // Seed test notifications data (for FASE 8)
  console.log('🔔 Seeding notification test data...');
  
  // Get some ingredients and set them to low stock for testing
  const testIngredientsForNotifications = await prisma.ingredient.findMany({
    take: 3,
    include: { currentStock: true },
  });

  for (const ingredient of testIngredientsForNotifications) {
    if (ingredient.currentStock) {
      await prisma.stock.update({
        where: { id: ingredient.currentStock.id },
        data: {
          currentQuantity: Math.floor(ingredient.minimumStock * 0.5), // Set to 50% of minimum
        },
      });
    }
  }
  console.log(`✓ ${testIngredientsForNotifications.length} ingredients set to low stock for testing`);

  // Create test orders for notification testing
  const kitchenStaff = await prisma.user.findMany({
    where: { role: 'COOK' },
  });

  if (kitchenStaff.length > 0 && createdRecipes.length > 0) {
    const testOrders = [
      {
        orderNumber: 'TEST-0001',
        orderType: OrderType.DINE_IN,
        priority: OrderPriority.URGENT,
        status: OrderStatus.PENDING,
        totalItems: 2,
      },
      {
        orderNumber: 'TEST-0002',
        orderType: OrderType.DINE_IN,
        priority: OrderPriority.NORMAL,
        status: OrderStatus.PENDING,
        totalItems: 3,
      },
    ];

    for (const orderData of testOrders) {
      const testOrder = await prisma.order.create({
        data: {
          ...orderData,
          restaurantId: restaurant.id,
          items: {
            create: [
              {
                recipeId: createdRecipes[0].id,
                quantity: 1,
              },
            ],
          },
        },
        include: {
          items: true,
        },
      });
    }
    console.log('✓ Test orders created for notification testing');
  }

  console.log('🎉 Seed completed successfully!');
  console.log('📊 Database is now populated with admin system data, staff, metrics, and notification test data!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });