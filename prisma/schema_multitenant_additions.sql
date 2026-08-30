-- This file documents the schema changes for multi-tenancy
-- It will be integrated into the main schema.prisma file

-- NEW ENUMS
enum RestaurantStatus {
  ACTIVE         // Ativo e pagando
  TRIAL          // Período de teste
  SUSPENDED      // Pagamento atrasado
  CANCELLED      // Assinatura cancelada
  ARCHIVED       // Inativo (soft delete)
}

enum AccountType {
  ASSET          // Ativo
  LIABILITY      // Passivo  
  EQUITY         // Patrimônio
  REVENUE        // Receita
  EXPENSE        // Despesa
}

-- NEW MODELS
model Restaurant {
  id                    String      @id @default(cuid())
  
  // Informações básicas
  name                  String      // "Pizzaria do João"
  cnpj                  String?     @unique
  email                 String?
  phone                 String?
  website               String?
  
  // Localização
  address               String?
  city                  String?
  state                 String?
  country               String     @default("BR")
  zipCode              String?
  
  // Configurações
  timezone              String     @default("America/Sao_Paulo")
  currency              String     @default("BRL")
  language              String     @default("pt-BR")
  
  // Status e Subscrição
  status                RestaurantStatus @default(ACTIVE)
  subscriptionTier      String     @default("starter")
  subscriptionStatus    String     @default("active")
  billingCycleStart     DateTime?
  billingCycleEnd       DateTime?
  trialEndsAt           DateTime?
  
  // Plano de Contas (Chart of Accounts)
  accountingMethod      String     @default("SIMPLIFIED") // SIMPLIFIED ou COMPLETE
  chartOfAccounts       ChartOfAccount[]
  incomeCategories      IncomeCategory[]
  expenseCategories     ExpenseCategory[]
  
  // Gateways de pagamento
  stripeAccountId       String?
  mercadoPagoAccountId  String?
  ifoodIntegrationId    String?
  rappiIntegrationId    String?
  uberIntegrationId     String?
  
  // Owner (primeiro usuário/admin)
  ownerId               String
  owner                 RestaurantUser @relation("RestaurantOwner", fields: [ownerId], references: [id])
  
  // Staff & Users
  users                 RestaurantUser[]
  staffMembers          StaffMember[]
  
  // Timestamps
  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt
  deletedAt             DateTime?  // Soft delete
  
  @@index([status])
  @@index([subscriptionStatus])
  @@index([createdAt])
  @@map("restaurants")
}

model RestaurantUser {
  id                    String      @id @default(cuid())
  restaurantId          String
  restaurant            Restaurant  @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  
  userId                String
  user                  User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Role dentro deste restaurante
  role                  UserRole
  
  // Permissões
  permissions           String[]    // JSON array
  
  // Status
  isActive              Boolean     @default(true)
  invitedAt             DateTime?
  acceptedAt            DateTime?
  
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  
  // Relations
  ownedRestaurant       Restaurant? @relation("RestaurantOwner")
  
  @@unique([restaurantId, userId])
  @@index([restaurantId])
  @@index([userId])
  @@map("restaurant_users")
}

model ChartOfAccount {
  id                    String      @id @default(cuid())
  restaurantId          String
  restaurant            Restaurant  @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  
  // Identificação
  code                  String      // "1.1.1.01"
  name                  String      // "Caixa"
  type                  AccountType
  
  // Estrutura
  parentId              String?
  parent                ChartOfAccount? @relation("AccountHierarchy", fields: [parentId], references: [id])
  children              ChartOfAccount[] @relation("AccountHierarchy")
  
  // Descrição
  description           String?
  notes                 String?
  
  // Status
  isActive              Boolean     @default(true)
  
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  
  @@unique([restaurantId, code])
  @@index([restaurantId, type])
  @@map("chart_of_accounts")
}

model IncomeCategory {
  id                    String      @id @default(cuid())
  restaurantId          String
  restaurant            Restaurant  @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  
  name                  String      // "Venda de Alimentos", "Bebidas", etc
  description           String?
  color                 String     @default("#22c55e") // Green for income
  isActive              Boolean    @default(true)
  
  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt
  
  @@unique([restaurantId, name])
  @@index([restaurantId])
  @@map("income_categories")
}

model ExpenseCategory {
  id                    String      @id @default(cuid())
  restaurantId          String
  restaurant            Restaurant  @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  
  name                  String      // "Aluguel", "Fornecedores", etc
  description           String?
  color                 String     @default("#ef4444") // Red for expenses
  isActive              Boolean    @default(true)
  
  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt
  
  @@unique([restaurantId, name])
  @@index([restaurantId])
  @@map("expense_categories")
}

-- UPDATES TO EXISTING MODELS
-- User model needs to add:
-- - currentRestaurantId: String? (which restaurant user is currently viewing)
-- - restaurants: RestaurantUser[] (list of restaurants user has access to)

-- StaffMember needs:
-- - restaurantId: String
