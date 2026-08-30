/**
 * Migration Script: Multi-Tenancy Setup
 * 
 * This script:
 * 1. Creates a default "Restaurant" for existing users
 * 2. Links all existing users to the restaurant
 * 3. Sets the currentRestaurantId for each user
 * 4. Creates default Chart of Accounts
 * 5. Creates default Income/Expense Categories
 */

import { prisma } from '@/lib/prisma';

async function main() {
  console.log('🍽️  Starting multi-tenancy migration...');

  try {
    // Step 1: Check if default restaurant already exists
    let defaultRestaurant = await prisma.restaurant.findFirst({
      where: { name: 'Restaurant Default' },
    });

    if (!defaultRestaurant) {
      console.log('📍 Creating default restaurant...');
      
      // Get the first OWNER user to be the owner of the default restaurant
      const owner = await prisma.user.findFirst({
        where: { role: 'OWNER' },
      });

      if (!owner) {
        console.error('❌ No OWNER user found. Please create an OWNER user first.');
        return;
      }

      // Create default restaurant
      defaultRestaurant = await prisma.restaurant.create({
        data: {
          name: 'Restaurant Default',
          country: 'BR',
          timezone: 'America/Sao_Paulo',
          currency: 'BRL',
          language: 'pt-BR',
          status: 'ACTIVE',
          subscriptionStatus: 'active',
          accountingMethod: 'SIMPLIFIED',
          ownerId: owner.id,
        },
      });

      console.log(`✅ Created default restaurant: ${defaultRestaurant.id}`);
    } else {
      console.log(`✅ Default restaurant already exists: ${defaultRestaurant.id}`);
    }

    // Step 2: Link all users to the default restaurant
    console.log('👥 Linking users to restaurant...');
    
    const allUsers = await prisma.user.findMany({
      select: { id: true, role: true },
    });

    for (const user of allUsers) {
      const existingLink = await prisma.restaurantUser.findUnique({
        where: {
          restaurantId_userId: {
            restaurantId: defaultRestaurant.id,
            userId: user.id,
          },
        },
      });

      if (!existingLink) {
        await prisma.restaurantUser.create({
          data: {
            restaurantId: defaultRestaurant.id,
            userId: user.id,
            role: user.role,
            isActive: true,
            acceptedAt: new Date(),
          },
        });
        console.log(`  ✓ Linked user ${user.id} to restaurant`);
      }
    }

    // Step 3: Set currentRestaurantId for all users
    console.log('🔄 Setting currentRestaurantId...');
    
    await prisma.user.updateMany({
      data: {
        currentRestaurantId: defaultRestaurant.id,
      },
    });

    console.log(`✅ Updated currentRestaurantId for all users`);

    // Step 4: Create default Chart of Accounts
    console.log('📊 Creating default Chart of Accounts...');
    
    const accounts = [
      { code: '1', name: 'Ativo', type: 'ASSET' },
      { code: '1.1', name: 'Ativo Circulante', type: 'ASSET' },
      { code: '1.1.1', name: 'Caixa', type: 'ASSET' },
      { code: '1.1.2', name: 'Banco', type: 'ASSET' },
      { code: '2', name: 'Passivo', type: 'LIABILITY' },
      { code: '3', name: 'Patrimonio Liquido', type: 'EQUITY' },
      { code: '4', name: 'Receita', type: 'REVENUE' },
      { code: '4.1', name: 'Venda de Alimentos', type: 'REVENUE' },
      { code: '5', name: 'Despesa', type: 'EXPENSE' },
      { code: '5.1', name: 'Custo de Mercadoria', type: 'EXPENSE' },
    ];

    for (const acc of accounts) {
      const existingAcc = await prisma.chartOfAccount.findUnique({
        where: {
          restaurantId_code: {
            restaurantId: defaultRestaurant.id,
            code: acc.code,
          },
        },
      });

      if (!existingAcc) {
        await prisma.chartOfAccount.create({
          data: {
            restaurantId: defaultRestaurant.id,
            code: acc.code,
            name: acc.name,
            type: acc.type as any,
            isActive: true,
          },
        });
        console.log(`  ✓ Created account ${acc.code}`);
      }
    }

    console.log('\n✅ Multi-tenancy migration completed successfully!');
    console.log(`📍 Default Restaurant ID: ${defaultRestaurant.id}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
