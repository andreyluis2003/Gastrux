const { PrismaClient, Decimal } = require('@prisma/client');
const bcryptjs = require('bcryptjs');

const prisma = new PrismaClient();

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

  // Get existing data
  const createdRecipes = await prisma.recipe.findMany({ take: 3 });
  const existingIngredients = await prisma.ingredient.findMany({ take: 10 });
  const now = new Date();

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
    const tierMap = {
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
      type: 'DISCOUNT',
      value: new Decimal('0.10'),
      maxRedemptions: null,
    },
    {
      name: 'Prato Grátis',
      description: 'Um prato grátis do cardápio',
      pointsCost: 250,
      type: 'FREE_ITEM',
      value: new Decimal('45.00'),
      maxRedemptions: null,
    },
    {
      name: 'Entrega Grátis',
      description: 'Frete grátis na próxima entrega',
      pointsCost: 150,
      type: 'FREE_DELIVERY',
      value: new Decimal('15.00'),
      maxRedemptions: 10,
    },
    {
      name: 'Upgrade para Prato Premium',
      description: 'Upgrade para um prato premium',
      pointsCost: 200,
      type: 'UPGRADE',
      value: new Decimal('20.00'),
      maxRedemptions: null,
    },
  ];

  const createdRewards = [];
  for (let idx = 0; idx < rewards.length; idx++) {
    const reward = rewards[idx];
    const created = await prisma.loyaltyReward.create({
      data: {
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

  console.log('🎉 Seed completed successfully!');
  console.log('📊 Database is now populated with customers, loyalty programs, and rewards!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
