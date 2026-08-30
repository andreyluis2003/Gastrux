import { prisma } from '../lib/prisma';
import bcryptjs from 'bcryptjs';
import { Decimal } from '@prisma/client/runtime/library';
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
            where: { name: cat.name },
            update: {},
            create: cat,
        });
    }
    console.log('✓ Default ingredient categories created');
    // Seed Recipes with Ingredients
    console.log('📋 Seeding recipes...');
    // First, let's get some ingredients that already exist
    const proteináCategory = await prisma.ingredientCategory.findUnique({
        where: { name: 'Proteína' },
    });
    const grãosCategory = await prisma.ingredientCategory.findUnique({
        where: { name: 'Grãos' },
    });
    const vegetaisCategory = await prisma.ingredientCategory.findUnique({
        where: { name: 'Vegetais' },
    });
    // Create recipes
    const recipes = [
        {
            code: 'RECIPE001',
            name: 'Filé de Frango à Parmegiana',
            description: 'Filé de frango empanado, coberto com molho de tomate e queijo',
            baseYield: 4,
            yieldUnit: 'un',
            portionSize: 1,
            portionUnit: 'un',
            prepTimeMinutes: 45,
            yieldLossFactor: 0.95,
        },
        {
            code: 'RECIPE002',
            name: 'Arroz e Feijão Integral',
            description: 'Acompanhamento clássico, saudável e nutritivo',
            baseYield: 8,
            yieldUnit: 'un',
            portionSize: 1,
            portionUnit: 'un',
            prepTimeMinutes: 30,
            yieldLossFactor: 0.92,
        },
        {
            code: 'RECIPE003',
            name: 'Salada Verde com Tomate',
            description: 'Salada fresca com vegetais da estação',
            baseYield: 6,
            yieldUnit: 'un',
            portionSize: 1,
            portionUnit: 'un',
            prepTimeMinutes: 15,
            yieldLossFactor: 0.98,
        },
    ];
    const createdRecipes = [];
    for (const recipe of recipes) {
        const created = await prisma.recipe.upsert({
            where: { code: recipe.code },
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
            create: recipe,
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
                planDate,
                notes: `Plano de produção para ${planDate.toLocaleDateString('pt-BR')}`,
                items: {
                    create: createdRecipes.slice(0, 2).map((recipe, idx) => ({
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
