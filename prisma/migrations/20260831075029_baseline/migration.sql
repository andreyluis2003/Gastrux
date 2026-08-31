-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WHATSAPP', 'LANDING_PAGE', 'PPC_CAMPAIGN', 'SEGMENT_PAGE', 'SURVEY', 'REFERRAL', 'ORGANIC', 'MANUAL', 'CALCULATOR');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'NURTURING', 'CONVERTED', 'LOST', 'UNRESPONSIVE');

-- CreateEnum
CREATE TYPE "LeadNurtureStage" AS ENUM ('CAPTURED', 'WELCOME_SENT', 'ENGAGED', 'DEMO_SCHEDULED', 'TRIAL_STARTED', 'TRIAL_ACTIVE', 'CONVERSION_PENDING', 'CONVERTED', 'CHURNED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'COOK', 'ADMIN');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TESTING');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('API', 'CSV', 'WEBHOOK', 'EDI');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SUCCESS', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PRODUCTION', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('ENTRY', 'MANUAL_DEDUCTION', 'AUTO_DEDUCTION', 'ADJUSTMENT', 'LOSS');

-- CreateEnum
CREATE TYPE "WasteReason" AS ENUM ('EXPIRED', 'PREPARATION', 'DAMAGED', 'OVERPRODUCTION', 'STORAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShoppingListStatus" AS ENUM ('PENDING', 'ORDERED', 'RECEIVED', 'PARTIAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOW_STOCK', 'INSUFFICIENT_FOR_PRODUCTION', 'NO_MOVEMENT', 'INVENTORY_DIVERGENCE', 'OVERSTOCKING', 'EXPIRED_SUPPLIER_QUOTE', 'CRITICAL_STOCK');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STOCK_ENTRY', 'STOCK_DEDUCTION', 'STATUS_CHANGE', 'CONFIRM');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('MANUAL', 'INVOICE', 'SUPPLIER_QUOTE');

-- CreateEnum
CREATE TYPE "PriceAlertType" AS ENUM ('ABOVE_MAX', 'BELOW_MIN', 'PRICE_CHANGE_PERCENTAGE');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "POSProvider" AS ENUM ('SQUARE', 'SUMUP', 'STONE', 'SAIPOS', 'TOTVS', 'GENERIC');

-- CreateEnum
CREATE TYPE "POSTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AlertTriggerType" AS ENUM ('LOW_STOCK_CRITICAL', 'LOW_MARGIN', 'WASTE_ANOMALY', 'SUPPLIER_PRICE_INCREASE', 'DEMAND_MISMATCH', 'EXPIRING_SOON');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('welcome', 'day3', 'day7', 'other');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryPlatform" AS ENUM ('ifood', 'uber_eats', 'rappi');

-- CreateEnum
CREATE TYPE "ExternalOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP', 'DELIVERED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeliveryEventType" AS ENUM ('STATUS_CHANGED', 'DELIVERY_ESTIMATED_TIME_UPDATED', 'DRIVER_ASSIGNED', 'DRIVER_LOCATION_UPDATED', 'CUSTOMER_CONTACT_REQUESTED', 'DELIVERY_CANCELLED', 'ORDER_PREPARATION_TIME_EXCEEDED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'RESTAURANT_CANCELLED', 'NOSHOW');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('REMINDER_24H', 'REMINDER_1H', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "OrderSessionStatus" AS ENUM ('OPEN', 'SENT_TO_KITCHEN', 'READY', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DELIVERY', 'DINE_IN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "StationAssignmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'HELD');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('OPENING', 'SALE', 'WITHDRAWAL', 'REFUND', 'PAYMENT', 'CLOSING', 'ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'APPROVED', 'DECLINED', 'REFUNDED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'CHARGEBACK', 'SETTLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'PIX', 'MERCADO_PAGO', 'BANK_TRANSFER', 'OTHER', 'STRIPE');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('MERCADO_PAGO', 'STRIPE', 'STRIPE_CONNECT', 'MANUAL');

-- CreateEnum
CREATE TYPE "CashFlowType" AS ENUM ('INCOME', 'EXPENSE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CashFlowStatus" AS ENUM ('PROJECTED', 'COMPLETED', 'PENDING');

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('kg', 'g', 'ml', 'l', 'un');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('CALL', 'EMAIL', 'SMS', 'IN_PERSON', 'COMMENT');

-- CreateEnum
CREATE TYPE "InteractionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "LoyaltyTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('EARNING', 'REDEMPTION', 'EXPIRY', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('DISCOUNT', 'FREE_ITEM', 'FREE_DELIVERY', 'UPGRADE');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('NORMAL', 'EXTENDED', 'REDUCED', 'OFF_DAY', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FIXED', 'HYBRID');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdminAction" AS ENUM ('USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'USER_ROLE_CHANGE', 'RECIPE_CREATE', 'RECIPE_UPDATE', 'RECIPE_DELETE', 'ORDER_CREATE', 'ORDER_UPDATE', 'ORDER_CANCEL', 'PAYMENT_PROCESS', 'PAYMENT_REFUND', 'INGREDIENT_CREATE', 'INGREDIENT_UPDATE', 'INGREDIENT_DELETE', 'STOCK_ADJUSTMENT', 'STOCK_TRANSFER', 'PRICE_CHANGE', 'DISCOUNT_APPLIED', 'PERMISSION_CHANGE', 'SYSTEM_CONFIG_CHANGE', 'REPORT_GENERATE', 'EXPORT_DATA', 'OTHER');

-- CreateEnum
CREATE TYPE "SegmentationType" AS ENUM ('VIP', 'REGULAR', 'OCCASIONAL', 'DORMANT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('STOCK_LOW', 'STOCK_CRITICAL', 'STOCK_EXPIRED', 'STOCK_RECEIVED', 'ORDER_RECEIVED', 'ORDER_READY', 'ORDER_COMPLETED', 'ORDER_CANCELLED', 'PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'PAYMENT_PENDING', 'STAFF_CLOCKED_IN', 'STAFF_CLOCKED_OUT', 'STAFF_ABSENT', 'STAFF_LATE', 'STAFF_SHIFT_REMINDER', 'STAFF_OVERTIME', 'ADMIN_USER_CREATED', 'ADMIN_USER_DELETED', 'ADMIN_USER_UPDATED', 'ADMIN_ROLE_CHANGED', 'ADMIN_PRICE_CHANGED', 'ADMIN_DISCOUNT_APPLIED', 'ADMIN_PERMISSION_CHANGED', 'ADMIN_SYSTEM_CONFIG_CHANGED', 'ADMIN_EXPORT_COMPLETED', 'ADMIN_REPORT_GENERATED', 'SYSTEM_ERROR', 'SYSTEM_MAINTENANCE', 'SYSTEM_INFO', 'GENERAL');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RestaurantStatus" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('BILLING', 'TECHNICAL', 'ACCOUNT', 'FEATURE_REQUEST', 'BUG_REPORT', 'INTEGRATION', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceBillingStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('NPS', 'CSAT', 'CES', 'GENERAL', 'BUG', 'IDEA');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'REVIEWING', 'PLANNED', 'IN_PROGRESS', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FeatureRequestStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'SHIPPED', 'DECLINED');

-- CreateEnum
CREATE TYPE "FeatureRequestPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AIInsightType" AS ENUM ('SALES', 'INVENTORY', 'CUSTOMERS', 'MENU', 'FINANCIAL', 'OPERATIONAL', 'DAILY_SUMMARY', 'ANOMALY_ALERT', 'CHAT_RESPONSE', 'COMBO_SUGGESTION', 'TEMPORAL_ANALYSIS', 'MIGRATION_QR');

-- CreateEnum
CREATE TYPE "WhatsAppConversationState" AS ENUM ('GREETING', 'MENU_BROWSING', 'CATEGORY_SELECTED', 'ITEM_SELECTED', 'CART_REVIEW', 'ORDER_TYPE', 'COLLECTING_INFO', 'CONFIRMING', 'COMPLETED', 'HUMAN_HANDOFF', 'IDLE');

-- CreateEnum
CREATE TYPE "WhatsAppOrderType" AS ENUM ('DELIVERY', 'PICKUP', 'DINE_IN');

-- CreateEnum
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppMessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'BUTTON_REPLY', 'LIST_REPLY', 'INTERACTIVE', 'TEMPLATE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CMVAlertLevel" AS ENUM ('NORMAL', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MenuEngineeringClass" AS ENUM ('STAR', 'HORSE', 'PUZZLE', 'DOG');

-- CreateEnum
CREATE TYPE "VoiceProvider" AS ENUM ('TWILIO', 'MOCK');

-- CreateEnum
CREATE TYPE "VoiceCallStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "VoiceCallOutcome" AS ENUM ('RESERVATION_CREATED', 'INFO_PROVIDED', 'TRANSFERRED', 'HANG_UP', 'NO_INTENT');

-- CreateEnum
CREATE TYPE "MessagingProvider" AS ENUM ('META_CLOUD', 'TAKE_BLIP', 'ZENVIA');

-- CreateEnum
CREATE TYPE "MessageTemplateCategory" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');

-- CreateEnum
CREATE TYPE "MessageTemplateStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "MessageCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageRecipientStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "role" "UserRole" NOT NULL DEFAULT 'COOK',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSignInAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "subscriptionId" TEXT,
    "subscriptionTier" TEXT NOT NULL DEFAULT 'starter',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'active',
    "billingCycleStart" TIMESTAMP(3),
    "billingCycleEnd" TIMESTAMP(3),
    "lastInvoiceDate" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "emailSentDay3" BOOLEAN NOT NULL DEFAULT false,
    "emailSentDay7" BOOLEAN NOT NULL DEFAULT false,
    "emailDay3SentAt" TIMESTAMP(3),
    "emailDay7SentAt" TIMESTAMP(3),
    "emailVariantDay3" TEXT,
    "emailVariantDay7" TEXT,
    "emailDay3OpenedAt" TIMESTAMP(3),
    "emailDay7OpenedAt" TIMESTAMP(3),
    "convertedToProAt" TIMESTAMP(3),
    "conversionSource" TEXT,
    "convertedToPlan" TEXT,
    "referralCode" TEXT,
    "referredByUserId" TEXT,
    "referralBonusEarned" INTEGER NOT NULL DEFAULT 0,
    "referralBonusCount" INTEGER NOT NULL DEFAULT 0,
    "referralTier" TEXT NOT NULL DEFAULT 'bronze',
    "currentRestaurantId" TEXT,
    "emailDay14SentAt" TIMESTAMP(3),
    "emailDay1SentAt" TIMESTAMP(3),
    "emailDay21SentAt" TIMESTAMP(3),
    "emailSentDay1" BOOLEAN NOT NULL DEFAULT false,
    "emailSentDay14" BOOLEAN NOT NULL DEFAULT false,
    "emailSentDay21" BOOLEAN NOT NULL DEFAULT false,
    "emailSentTrialEnding" BOOLEAN NOT NULL DEFAULT false,
    "emailSentWelcome" BOOLEAN NOT NULL DEFAULT false,
    "emailTrialEndingSentAt" TIMESTAMP(3),
    "emailWelcomeSentAt" TIMESTAMP(3),
    "acceptedTermsAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_onboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "defaultCategoriesCreated" BOOLEAN NOT NULL DEFAULT false,
    "exampleRecipeCreated" BOOLEAN NOT NULL DEFAULT false,
    "modulesViewed" TEXT NOT NULL DEFAULT '',
    "ingredientAdded" BOOLEAN NOT NULL DEFAULT false,
    "recipeCreated" BOOLEAN NOT NULL DEFAULT false,
    "productionPlanCreated" BOOLEAN NOT NULL DEFAULT false,
    "stockMovementRecorded" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_categories" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "standardUnit" "Unit" NOT NULL,
    "purchaseUnit" "Unit" NOT NULL,
    "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "minimumStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "referenceCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxAcceptablePrice" DOUBLE PRECISION,
    "lastCostUpdate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "contactPerson" TEXT,
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_suppliers" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL,
    "supplierCode" TEXT,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "leadDays" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_integrations" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "integrationType" "IntegrationType" NOT NULL,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "apiUrl" TEXT,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncError" TEXT,
    "syncFrequency" INTEGER NOT NULL DEFAULT 24,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_price_syncs" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "lastFetchedPrice" DECIMAL(65,30) NOT NULL,
    "previousPrice" DECIMAL(65,30),
    "lastFetchedAt" TIMESTAMP(3) NOT NULL,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "leadTime" INTEGER,
    "minimumOrder" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_price_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseYield" DOUBLE PRECISION NOT NULL,
    "yieldUnit" "Unit" NOT NULL,
    "portionSize" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "portionUnit" "Unit" NOT NULL,
    "prepTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "yieldLossFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPerPortion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sellingPrice" DOUBLE PRECISION,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "Unit" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_scales" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scaled_ingredients" (
    "id" TEXT NOT NULL,
    "scaleId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "Unit" NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "scaled_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_plans" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "planDate" TIMESTAMP(3) NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_plan_items" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "status" "ItemStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consolidated_needs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "totalQuantity" DOUBLE PRECISION NOT NULL,
    "unit" "Unit" NOT NULL,
    "currentStock" DOUBLE PRECISION NOT NULL,
    "shortage" DOUBLE PRECISION NOT NULL,
    "suppliers" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consolidated_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "restaurantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "currentQuantity" DOUBLE PRECISION NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAuditedAt" TIMESTAMP(3),

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "reason" TEXT,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_logs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "Unit" NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" "WasteReason" NOT NULL,
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "adjustmentDate" TIMESTAMP(3) NOT NULL,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjustment_items" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "expectedQty" DOUBLE PRECISION NOT NULL,
    "countedQty" DOUBLE PRECISION NOT NULL,
    "difference" DOUBLE PRECISION NOT NULL,
    "variance" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "adjustment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_lists" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "planId" TEXT,
    "listDate" TIMESTAMP(3) NOT NULL,
    "status" "ShoppingListStatus" NOT NULL DEFAULT 'PENDING',
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_items" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "shoppingListId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "supplierId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "Unit" NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "actualCost" DOUBLE PRECISION,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "ingredientId" TEXT,
    "recipeId" TEXT,
    "planId" TEXT,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertType" "AlertType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restaurantId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "supplierName" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION,
    "notes" TEXT,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_ocr_results" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "extractedJSON" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "processingTime" INTEGER NOT NULL DEFAULT 0,
    "modelUsed" TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_ocr_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_trends" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "supplierId" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION,
    "source" "PriceSource" NOT NULL DEFAULT 'MANUAL',
    "invoiceId" TEXT,
    "recordedDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_trends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_alerts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "supplierId" TEXT,
    "maxPrice" DOUBLE PRECISION NOT NULL,
    "minPrice" DOUBLE PRECISION,
    "alertType" "PriceAlertType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_forecasts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "currentStock" DECIMAL(65,30) NOT NULL,
    "dailyConsumptionAvg" DECIMAL(65,30) NOT NULL,
    "daysUntilEmpty" DOUBLE PRECISION NOT NULL,
    "confidenceLevel" DECIMAL(65,30) NOT NULL DEFAULT 0.95,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "suggestedReorderQty" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "forecastDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumption_patterns" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "avgDailyConsumption" DECIMAL(65,30) NOT NULL,
    "minConsumption" DECIMAL(65,30) NOT NULL,
    "maxConsumption" DECIMAL(65,30) NOT NULL,
    "stdDeviation" DECIMAL(65,30) NOT NULL,
    "samplesCount" INTEGER NOT NULL DEFAULT 1,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumption_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_settings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "provider" "POSProvider" NOT NULL DEFAULT 'STONE',
    "squareAccessToken" TEXT,
    "squareLocationId" TEXT,
    "squareMerchantId" TEXT,
    "sumupApiKey" TEXT,
    "sumupMerchantId" TEXT,
    "isConfigured" BOOLEAN NOT NULL DEFAULT false,
    "webhookSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deviceSerial" TEXT,
    "stoneApiKey" TEXT,
    "stoneMerchantId" TEXT,
    "stoneStoneCode" TEXT,
    "saiposApiKey" TEXT,
    "saiposStoreId" TEXT,
    "totvsTenantId" TEXT,
    "totvsApiKey" TEXT,
    "totvsUnitId" TEXT,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "autoReconcile" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pos_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_transactions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "provider" "POSProvider" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "paymentMethod" TEXT NOT NULL,
    "status" "POSTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "items" TEXT NOT NULL,
    "receiptUrl" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerCPF" TEXT,
    "notes" TEXT,
    "tableNumber" TEXT,
    "operatorName" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sale_items" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "recipeId" TEXT,
    "menuItemId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_forecasts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "forecastDate" TIMESTAMP(3) NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "predictedQuantity" DOUBLE PRECISION NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "seasonality" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "modelAccuracy" DOUBLE PRECISION,
    "lastTrainedAt" TIMESTAMP(3),
    "trainingSamples" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_alerts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggerType" "AlertTriggerType" NOT NULL,
    "conditions" TEXT NOT NULL,
    "shouldNotify" BOOLEAN NOT NULL DEFAULT true,
    "shouldEmail" BOOLEAN NOT NULL DEFAULT false,
    "notificationUsers" TEXT,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 60,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smart_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_alert_logs" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL,
    "ingredientId" TEXT,
    "recipeId" TEXT,
    "triggerValue" DOUBLE PRECISION NOT NULL,
    "thresholdValue" DOUBLE PRECISION NOT NULL,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "smart_alert_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_transaction_counts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_transaction_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_delivery_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailType" "EmailType" NOT NULL,
    "variant" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'SENT',
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bounceReason" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_variants" (
    "id" TEXT NOT NULL,
    "emailType" "EmailType" NOT NULL,
    "variantLabel" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "ctaText" TEXT,
    "ctaUrl" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_funnels" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signupDate" TIMESTAMP(3) NOT NULL,
    "emailDay3SentDate" TIMESTAMP(3),
    "emailDay3OpenedDate" TIMESTAMP(3),
    "emailDay3ClickedDate" TIMESTAMP(3),
    "emailDay7SentDate" TIMESTAMP(3),
    "emailDay7OpenedDate" TIMESTAMP(3),
    "emailDay7ClickedDate" TIMESTAMP(3),
    "convertedToPaidDate" TIMESTAMP(3),
    "convertedToPlan" TEXT,
    "conversionSource" TEXT,
    "daysSinceSignup" INTEGER,
    "daysToConversion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversion_funnels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailType" "EmailType" NOT NULL,
    "rating" INTEGER NOT NULL,
    "helpful" BOOLEAN,
    "comment" TEXT,
    "sentiment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_responses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentSystem" TEXT,
    "painPoints" TEXT[],
    "willingnessToPayRaw" TEXT,
    "willingnessToPayBRL" INTEGER,
    "mostImportantFeature" TEXT,
    "featureRanking" TEXT[],
    "businessUnits" TEXT,
    "monthlyRevenue" TEXT,
    "employeeCount" TEXT,
    "willingToTalk" BOOLEAN,
    "preferredContact" TEXT,
    "contactInfo" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedInSeconds" INTEGER,
    "source" TEXT,
    "isWarmLead" BOOLEAN NOT NULL DEFAULT false,
    "followUpSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_analytics" (
    "id" TEXT NOT NULL,
    "totalResponses" INTEGER NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "averageCompletionTime" INTEGER NOT NULL DEFAULT 0,
    "willingnessDistribution" TEXT NOT NULL,
    "medianWtp" INTEGER NOT NULL DEFAULT 0,
    "monetizeableSegment" INTEGER NOT NULL DEFAULT 0,
    "topPainPoints" TEXT NOT NULL,
    "topFeatures" TEXT NOT NULL,
    "segmentationByUnits" TEXT NOT NULL,
    "segmentationByRevenue" TEXT NOT NULL,
    "totalWarmLeads" INTEGER NOT NULL DEFAULT 0,
    "warmLeadsFollowedUp" INTEGER NOT NULL DEFAULT 0,
    "contactMethodDistribution" TEXT NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "bonusBRL" INTEGER,
    "earnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_ab_tests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "targetSegment" TEXT NOT NULL DEFAULT 'all',
    "winnerVariantId" TEXT,
    "winnerConfidence" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_ab_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_ab_variants" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" INTEGER NOT NULL,
    "subjectLine" TEXT NOT NULL,
    "contentTemplate" TEXT NOT NULL,
    "sendTime" TEXT NOT NULL DEFAULT '08:00',
    "cta" TEXT,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "conversionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_ab_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_ab_test_results" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "events" TEXT NOT NULL,

    CONSTRAINT "email_ab_test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "subjectLine" TEXT NOT NULL,
    "preheader" TEXT,
    "content" TEXT NOT NULL,
    "enableABTest" BOOLEAN NOT NULL DEFAULT false,
    "abTestingMetric" TEXT NOT NULL DEFAULT 'open_rate',
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalOpened" INTEGER NOT NULL DEFAULT 0,
    "totalClicked" INTEGER NOT NULL DEFAULT 0,
    "totalConverted" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "launchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_segments" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "segmentType" TEXT NOT NULL,
    "segmentName" TEXT NOT NULL,
    "customFilter" TEXT,
    "targetUserCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "convertCount" INTEGER NOT NULL DEFAULT 0,
    "aVariantPercentage" INTEGER NOT NULL DEFAULT 50,
    "bVariantPercentage" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_ab_variants" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "description" TEXT,
    "subjectLine" TEXT NOT NULL,
    "preheader" TEXT,
    "content" TEXT NOT NULL,
    "cta" TEXT,
    "ctaColor" TEXT NOT NULL DEFAULT '#0066ff',
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "convertCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_ab_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_schedules" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "scheduleType" TEXT NOT NULL DEFAULT 'immediate',
    "scheduledAt" TIMESTAMP(3),
    "sendTime" TEXT NOT NULL DEFAULT '08:00',
    "recurringPattern" TEXT,
    "recurringStartDate" TIMESTAMP(3),
    "recurringEndDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastExecutedAt" TIMESTAMP(3),
    "nextExecutionAt" TIMESTAMP(3),
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_performance" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "variantId" TEXT,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "convertCount" INTEGER NOT NULL DEFAULT 0,
    "openRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clickRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "firstOpenAt" TIMESTAMP(3),
    "lastOpenAt" TIMESTAMP(3),
    "firstClickAt" TIMESTAMP(3),
    "userEmails" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partnership_contacts" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactType" TEXT NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'prospect',
    "lastContactDate" TIMESTAMP(3),
    "nextFollowUp" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partnership_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partnership_communications" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "outcome" TEXT,
    "responseDate" TIMESTAMP(3),
    "responseContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partnership_communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partnership_deals" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "proposalType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposal',
    "targetClosureDate" TIMESTAMP(3),
    "actualClosureDate" TIMESTAMP(3),
    "termsDocument" TEXT,
    "revenue" DOUBLE PRECISION,
    "commission" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partnership_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beta_testers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "restaurantName" TEXT NOT NULL,
    "restaurantCity" TEXT NOT NULL,
    "restaurantState" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prospect',
    "invitationSentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "accessGrantedAt" TIMESTAMP(3),
    "accessEndsAt" TIMESTAMP(3),
    "feedbackLevel" TEXT,
    "weeklyMeetings" INTEGER NOT NULL DEFAULT 0,
    "lastInteractionAt" TIMESTAMP(3),
    "feedbackNotes" TEXT,
    "feedbackScore" INTEGER,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beta_testers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_support_interactions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "rating" INTEGER,
    "thumbsUp" BOOLEAN,
    "hallucinationFlag" BOOLEAN NOT NULL DEFAULT false,
    "confidenceScore" DOUBLE PRECISION,
    "responseTimeMs" INTEGER,
    "escalatedToHuman" BOOLEAN NOT NULL DEFAULT false,
    "resolvedIssue" BOOLEAN,
    "topic" TEXT,
    "feedbackText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_support_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_quality_alerts" (
    "id" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_quality_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beta_tester_interactions" (
    "id" TEXT NOT NULL,
    "betaTesterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beta_tester_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_integrations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "platform" "DeliveryPlatform" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "apiKey" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "storeId" TEXT,
    "storeName" TEXT,
    "storePhone" TEXT,
    "storeAddress" TEXT,
    "webhookUrl" TEXT,
    "lastWebhookTest" TIMESTAMP(3),
    "webhookActive" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "totalOrdersSynced" INTEGER NOT NULL DEFAULT 0,
    "lastOrderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_orders" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "externalCustomerId" TEXT,
    "internalOrderId" TEXT,
    "status" "ExternalOrderStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryCity" TEXT,
    "deliveryZipcode" TEXT,
    "items" TEXT NOT NULL,
    "specialInstructions" TEXT,
    "orderReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimatedDeliveryTime" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_mappings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "externalItemId" TEXT NOT NULL,
    "externalName" TEXT NOT NULL,
    "externalPrice" DOUBLE PRECISION NOT NULL,
    "isSynced" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'SUCCESS',
    "syncError" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_logs" (
    "id" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "eventType" "DeliveryEventType" NOT NULL,
    "previousStatus" "ExternalOrderStatus",
    "newStatus" "ExternalOrderStatus" NOT NULL,
    "message" TEXT,
    "eventTimestamp" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_sections" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "sectionId" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "description" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "maintenanceNote" TEXT,
    "isOccupied" BOOLEAN NOT NULL DEFAULT false,
    "lastOccupiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "qrToken" TEXT,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_profiles" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "totalReservations" INTEGER NOT NULL DEFAULT 0,
    "totalVisits" INTEGER NOT NULL DEFAULT 0,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "lastReservationAt" TIMESTAMP(3),
    "firstReservationAt" TIMESTAMP(3),
    "preferredTableSectionId" TEXT,
    "preferredTime" TEXT,
    "specialRequests" TEXT,
    "acceptsEmailReminders" BOOLEAN NOT NULL DEFAULT true,
    "acceptsSmsReminders" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "guestId" TEXT,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "guestPhone" TEXT,
    "tableId" TEXT,
    "partySize" INTEGER NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 90,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "isNoShow" BOOLEAN NOT NULL DEFAULT false,
    "noShowReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_reminders" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "guestId" TEXT,
    "reminderType" "ReminderType" NOT NULL,
    "minutesBefore" INTEGER NOT NULL,
    "isScheduled" BOOLEAN NOT NULL DEFAULT true,
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'EMAIL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL DEFAULT 'DELIVERY',
    "externalOrderId" TEXT,
    "reservationId" TEXT,
    "customerId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "OrderPriority" NOT NULL DEFAULT 'NORMAL',
    "estimatedPrepTime" INTEGER,
    "actualStartTime" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "specialInstructions" TEXT,
    "subtotal" DECIMAL(12,2),
    "taxes" DECIMAL(12,2),
    "fees" DECIMAL(12,2),
    "discount" DECIMAL(12,2),
    "total" DECIMAL(12,2),
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "specialInstructions" TEXT,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING',
    "stationId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_stations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "displayColor" TEXT NOT NULL DEFAULT '#3b82f6',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "restaurantId" TEXT,

    CONSTRAINT "kitchen_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_station_assignments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "status" "StationAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalItems" INTEGER NOT NULL,
    "completedItems" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_station_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_prep_times" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "actualMinutes" INTEGER,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "order_prep_times_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_sessions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tableId" TEXT,
    "orderId" TEXT,
    "status" "OrderSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentToKitchenAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "customerName" TEXT,
    "tableNumber" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_session_items" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "specialInstructions" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_session_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "openingBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "expectedBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "restaurantId" TEXT,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "operatorName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "orderId" TEXT,
    "reservationId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "emoji" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(65,30) NOT NULL,
    "recipeId" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "displayOnQR" BOOLEAN NOT NULL DEFAULT true,
    "displayOnWeb" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_images" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "cloudStoragePath" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_item_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "reservationId" TEXT,
    "transactionId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "customerEmail" TEXT,
    "customerName" TEXT,
    "description" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "amountRefunded" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "customerDocument" TEXT,
    "customerPhone" TEXT,
    "expectedSettlementAt" TIMESTAMP(3),
    "gateway" "PaymentGateway" NOT NULL DEFAULT 'MANUAL',
    "gatewayFee" DECIMAL(65,30),
    "gatewayPaymentId" TEXT,
    "netAmount" DECIMAL(65,30),
    "platformFee" DECIMAL(65,30),
    "restaurantId" TEXT,
    "settledAt" TIMESTAMP(3),
    "settlementStatus" TEXT,
    "subscriptionId" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mercado_pago_transactions" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "preferenceId" TEXT NOT NULL,
    "externalReference" TEXT,
    "mpPaymentId" TEXT,
    "mpStatus" TEXT,
    "mpStatusDetail" TEXT,
    "paymentType" TEXT,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "notificationId" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "initPoint" TEXT,
    "installmentRate" DECIMAL(65,30),
    "mpCollectionId" TEXT,
    "mpCollectionStatus" TEXT,
    "payerDocNumber" TEXT,
    "payerDocType" TEXT,
    "payerEmail" TEXT,
    "sandboxInitPoint" TEXT,
    "webhookPayload" TEXT,

    CONSTRAINT "mercado_pago_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_transactions" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeInvoiceId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripeStatus" TEXT,
    "stripeReceiptUrl" TEXT,
    "paymentMethodType" TEXT,
    "paymentMethodDetails" TEXT,
    "cardBrand" TEXT,
    "cardLast4" TEXT,
    "cardExpMonth" INTEGER,
    "cardExpYear" INTEGER,
    "cardNetwork" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "webhookPayload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "reason" TEXT,
    "gateway" "PaymentGateway" NOT NULL,
    "gatewayRefundId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "metadata" TEXT,
    "processedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "userId" TEXT,
    "tier" TEXT NOT NULL,
    "planName" TEXT,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "gateway" "PaymentGateway" NOT NULL,
    "gatewaySubscriptionId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" TEXT NOT NULL DEFAULT 'active',
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "paymentId" TEXT,
    "gateway" "PaymentGateway" NOT NULL,
    "gatewayTransferId" TEXT,
    "grossAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "feeAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "bankAccountId" TEXT,
    "destinationAccount" TEXT,
    "expectedDate" TIMESTAMP(3),
    "initiatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_modifiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "priceAdjustment" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "restaurantId" TEXT,

    CONSTRAINT "item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_session_item_modifiers" (
    "id" TEXT NOT NULL,
    "sessionItemId" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,
    "priceAdjustment" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_session_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_modifiers" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,
    "priceAdjustment" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfe_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "stateRegistration" TEXT,
    "municipalRegistration" TEXT,
    "companyName" TEXT,
    "tradeName" TEXT,
    "nfeProvider" TEXT NOT NULL DEFAULT 'focusnfe',
    "nfeApiKey" TEXT NOT NULL DEFAULT '',
    "certificatePassword" TEXT,
    "seriesNFe" INTEGER NOT NULL DEFAULT 1,
    "seriesNFCe" INTEGER NOT NULL DEFAULT 1,
    "nextNumberNFe" INTEGER NOT NULL DEFAULT 1,
    "nextNumberNFCe" INTEGER NOT NULL DEFAULT 1,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "issueNFCeForCPF" BOOLEAN NOT NULL DEFAULT true,
    "issueNFeForCNPJ" BOOLEAN NOT NULL DEFAULT true,
    "autoIssueOnSale" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contingencyMode" BOOLEAN NOT NULL DEFAULT false,
    "uf" TEXT NOT NULL DEFAULT 'SP',
    "crt" TEXT NOT NULL DEFAULT '1',
    "natOp" TEXT NOT NULL DEFAULT 'VENDA DE MERCADORIA',

    CONSTRAINT "nfe_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfe_documents" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "orderId" TEXT,
    "paymentId" TEXT,
    "reservationId" TEXT,
    "documentType" TEXT NOT NULL,
    "documentNumber" INTEGER NOT NULL,
    "documentSeries" INTEGER NOT NULL,
    "accessKey" TEXT,
    "customerName" TEXT,
    "customerCPF" TEXT,
    "customerCNPJ" TEXT,
    "customerEmail" TEXT,
    "issueDate" TIMESTAMP(3),
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalICMS" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalIPI" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalPIS" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCOFINS" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "statusDescription" TEXT,
    "protocolNumber" TEXT,
    "xmlUrl" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancellationReason" TEXT,
    "dataSnapshot" JSONB,
    "orderSessionId" TEXT,
    "providerRef" TEXT,
    "qrCodeData" TEXT,
    "qrCodeUrl" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "nfe_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfe_items" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "totalPrice" DECIMAL(65,30) NOT NULL,
    "ncm" TEXT,
    "cfop" TEXT,
    "recipeId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nfe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfe_logs" (
    "id" TEXT NOT NULL,
    "configId" TEXT,
    "documentId" TEXT,
    "eventType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requestData" TEXT,
    "responseData" TEXT,
    "statusCode" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "webhookId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nfe_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_batches" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "manufacturer" TEXT,
    "manufacturingDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "initialQuantity" DECIMAL(65,30) NOT NULL,
    "currentQuantity" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL,
    "supplierId" TEXT,
    "invoiceNumber" TEXT,
    "nfeKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_traces" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "previousBatchId" TEXT,
    "movementType" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL,
    "orderId" TEXT,
    "orderSessionItemId" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_traces" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT,

    CONSTRAINT "order_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "birthDate" TIMESTAMP(3),
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "segment" TEXT,
    "totalSpent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "lastOrderAt" TIMESTAMP(3),
    "averageTicket" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "restaurantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_interactions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "InteractionType" NOT NULL,
    "subject" TEXT NOT NULL,
    "notes" TEXT,
    "status" "InteractionStatus" NOT NULL DEFAULT 'PENDING',
    "followUpDate" TIMESTAMP(3),
    "followUpNotes" TEXT,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_programs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pointsPerReal" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "minPointsToRedeem" INTEGER NOT NULL DEFAULT 100,
    "pointsExpiryMonths" INTEGER NOT NULL DEFAULT 12,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "restaurantId" TEXT,

    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_loyalty_accounts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "currentPoints" INTEGER NOT NULL DEFAULT 0,
    "totalPointsEarned" INTEGER NOT NULL DEFAULT 0,
    "totalPointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tier" "LoyaltyTier" NOT NULL DEFAULT 'BRONZE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_loyalty_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "rewardId" TEXT,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_rewards" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pointsCost" INTEGER NOT NULL,
    "type" "RewardType" NOT NULL,
    "value" DECIMAL(65,30),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxRedemptions" INTEGER,
    "currentRedemptions" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_flow_records" (
    "id" TEXT NOT NULL,
    "type" "CashFlowType" NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "paymentId" TEXT,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" "CashFlowStatus" NOT NULL DEFAULT 'COMPLETED',
    "metadata" JSONB,

    CONSTRAINT "cash_flow_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_metrics" (
    "id" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "target" DECIMAL(12,2),
    "percentageChange" DECIMAL(5,2),
    "metadata" JSONB,

    CONSTRAINT "financial_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_forecasts" (
    "id" TEXT NOT NULL,
    "forecastType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "forecastedValue" DECIMAL(12,2) NOT NULL,
    "confidence" DECIMAL(3,2),
    "method" TEXT NOT NULL,
    "actualValue" DECIMAL(12,2),
    "variance" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_members" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cpf" TEXT,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'COOK',
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "defaultStartTime" TEXT DEFAULT '08:00',
    "defaultEndTime" TEXT DEFAULT '18:00',
    "basesalary" DECIMAL(12,2),
    "commissionType" "CommissionType" NOT NULL DEFAULT 'PERCENTAGE',
    "commissionValue" DECIMAL(12,2),
    "totalOrdersProcessed" INTEGER NOT NULL DEFAULT 0,
    "averagePreparationTime" INTEGER,
    "customerSatisfactionScore" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_shifts" (
    "id" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "shiftDate" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "shiftType" "ShiftType" NOT NULL DEFAULT 'NORMAL',
    "isWorked" BOOLEAN NOT NULL DEFAULT false,
    "actualStartTime" TIMESTAMP(3),
    "actualEndTime" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_commissions" (
    "id" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "totalSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commissionEarned" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonusEarned" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalEarned" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "AdminAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT,
    "changesBefore" TEXT,
    "changesAfter" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "financialImpact" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_snapshots" (
    "snapshotDate" DATE NOT NULL,
    "totalRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "averageTicket" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "profitMargin" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "returningCustomers" INTEGER NOT NULL DEFAULT 0,
    "totalStaffWorking" INTEGER NOT NULL DEFAULT 0,
    "averagePrepTime" INTEGER,
    "ingredientsLowStock" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "customer_segments" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "segment" "SegmentationType" NOT NULL DEFAULT 'REGULAR',
    "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "lastOrderAt" TIMESTAMP(3),
    "averageTicket" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "userId" TEXT,
    "type" "NotificationType" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "actionUrl" TEXT,
    "actionLabel" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'BR',
    "zipCode" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "status" "RestaurantStatus" NOT NULL DEFAULT 'ACTIVE',
    "subscriptionTier" TEXT NOT NULL DEFAULT 'starter',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'active',
    "billingCycleStart" TIMESTAMP(3),
    "billingCycleEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "accountingMethod" TEXT NOT NULL DEFAULT 'SIMPLIFIED',
    "stripeAccountId" TEXT,
    "mercadoPagoAccountId" TEXT,
    "ifoodIntegrationId" TEXT,
    "rappiIntegrationId" TEXT,
    "uberIntegrationId" TEXT,
    "logoUrl" TEXT,
    "businessHours" JSONB,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "dailySummaryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailySummaryHour" INTEGER NOT NULL DEFAULT 22,
    "dailySummaryPhone" TEXT,
    "alertsWhatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "alertsEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "packagingQrEnabled" BOOLEAN NOT NULL DEFAULT false,
    "packagingQrDiscount" INTEGER NOT NULL DEFAULT 10,
    "packagingQrMessage" TEXT,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_users" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permissions" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "invitedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentId" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_categories" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#22c55e',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#ef4444',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_articles" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "authorId" TEXT,
    "keywords" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "helpful" INTEGER NOT NULL DEFAULT 0,
    "notHelpful" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "restaurantId" TEXT,
    "userId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "subject" TEXT NOT NULL,
    "category" "SupportCategory" NOT NULL DEFAULT 'OTHER',
    "priority" "SupportPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
    "contactEmail" TEXT,
    "contactName" TEXT,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" INTEGER,
    "ratingComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "attachments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "restaurantId" TEXT,
    "userId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerDocument" TEXT,
    "customerAddress" TEXT,
    "subscriptionId" TEXT,
    "description" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "subtotal" DECIMAL(65,30) NOT NULL,
    "tax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" "InvoiceBillingStatus" NOT NULL DEFAULT 'ISSUED',
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "paymentMethod" TEXT,
    "pdfUrl" TEXT,
    "notes" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "userId" TEXT,
    "type" "FeedbackType" NOT NULL,
    "score" INTEGER,
    "comment" TEXT,
    "page" TEXT,
    "feature" TEXT,
    "email" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "tags" TEXT,
    "internalNotes" TEXT,
    "featureRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_requests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "createdById" TEXT,
    "status" "FeatureRequestStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "FeatureRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "estimatedEffort" TEXT,
    "targetRelease" TEXT,
    "plannedFor" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_votes" (
    "id" TEXT NOT NULL,
    "featureRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "type" "AIInsightType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "dataSnapshot" TEXT,
    "timeRange" TEXT,
    "score" INTEGER,
    "tags" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "restaurantId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_milestones" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "orderCount" INTEGER NOT NULL,
    "bonusPoints" INTEGER NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(65,30),
    "freeItem" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "notifyCustomer" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_milestone_redemptions" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_milestone_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phoneNumberId" TEXT,
    "businessAccountId" TEXT,
    "accessToken" TEXT,
    "verifyToken" TEXT,
    "displayPhoneNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "greeting" TEXT DEFAULT 'Olá! 👋 Bem-vindo ao nosso restaurante. Digite *menu* para ver o cardápio ou *ajuda* para opções.',
    "businessHours" TEXT,
    "outsideHoursMessage" TEXT,
    "totalConversations" INTEGER NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "customerName" TEXT,
    "profileName" TEXT,
    "state" "WhatsAppConversationState" NOT NULL DEFAULT 'GREETING',
    "context" JSONB,
    "cart" JSONB,
    "cartTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "orderType" "WhatsAppOrderType",
    "deliveryAddress" TEXT,
    "tableNumber" INTEGER,
    "customerNotes" TEXT,
    "orderSessionId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastBotReplyAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "type" "WhatsAppMessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "payload" JSONB,
    "waMessageId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cmv_snapshots" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodDays" INTEGER NOT NULL DEFAULT 30,
    "purchases" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumption" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "losses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCMV" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cmvPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alertLevel" "CMVAlertLevel" NOT NULL DEFAULT 'NORMAL',
    "alertMessage" TEXT,
    "autoGenerated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cmv_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_engineering_snapshots" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodDays" INTEGER NOT NULL DEFAULT 30,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitMargin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "popularity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "classification" "MenuEngineeringClass" NOT NULL,
    "recommendation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_engineering_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_agent_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "provider" "VoiceProvider" NOT NULL DEFAULT 'MOCK',
    "twilioAccountSid" TEXT,
    "twilioAuthToken" TEXT,
    "twilioPhoneNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "voice" TEXT NOT NULL DEFAULT 'Polly.Camila-Neural',
    "greeting" TEXT NOT NULL DEFAULT 'Olá! Aqui é a assistente virtual do restaurante. Como posso ajudar?',
    "goodbye" TEXT NOT NULL DEFAULT 'Obrigada pelo contato. Até breve!',
    "outsideHoursMessage" TEXT NOT NULL DEFAULT 'No momento estamos fora do horário de atendimento. Por favor, ligue de volta durante nosso horário comercial.',
    "transferMessage" TEXT NOT NULL DEFAULT 'Vou transferir para um atendente humano. Aguarde um momento, por favor.',
    "allowReservations" BOOLEAN NOT NULL DEFAULT true,
    "allowInfo" BOOLEAN NOT NULL DEFAULT true,
    "allowTransfer" BOOLEAN NOT NULL DEFAULT true,
    "transferNumber" TEXT,
    "businessHours" JSONB,
    "minAdvanceMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 60,
    "maxPartySize" INTEGER NOT NULL DEFAULT 12,
    "defaultDurationMin" INTEGER NOT NULL DEFAULT 90,
    "totalCalls" INTEGER NOT NULL DEFAULT 0,
    "totalReservations" INTEGER NOT NULL DEFAULT 0,
    "totalTransferred" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_agent_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_calls" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "callSid" TEXT,
    "fromNumber" TEXT,
    "toNumber" TEXT,
    "status" "VoiceCallStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "outcome" "VoiceCallOutcome",
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "draftData" JSONB,
    "reservationId" TEXT,
    "durationSec" INTEGER,
    "recordingUrl" TEXT,
    "isSimulation" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_provider_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "provider" "MessagingProvider" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "botIdentifier" TEXT,
    "fromNumber" TEXT,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "blipRouter" TEXT DEFAULT 'https://msging.net',
    "zenviaAccount" TEXT,
    "maxPerMinute" INTEGER NOT NULL DEFAULT 60,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalDelivered" INTEGER NOT NULL DEFAULT 0,
    "totalFailed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "category" "MessageTemplateCategory" NOT NULL DEFAULT 'UTILITY',
    "language" TEXT NOT NULL DEFAULT 'pt_BR',
    "headerText" TEXT,
    "bodyText" TEXT NOT NULL,
    "footerText" TEXT,
    "buttons" JSONB,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "status" "MessageTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "metaTemplateId" TEXT,
    "blipTemplateId" TEXT,
    "zenviaTemplateId" TEXT,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_campaigns" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templateId" TEXT NOT NULL,
    "provider" "MessagingProvider" NOT NULL,
    "status" "MessageCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalDelivered" INTEGER NOT NULL DEFAULT 0,
    "totalRead" INTEGER NOT NULL DEFAULT 0,
    "totalFailed" INTEGER NOT NULL DEFAULT 0,
    "defaultVariables" JSONB NOT NULL DEFAULT '{}',
    "throttlePerMin" INTEGER,
    "errorSummary" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "name" TEXT,
    "customerId" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "status" "MessageRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "providerMsgId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_leads" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "source" "LeadSource" NOT NULL,
    "sourceDetail" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "name" TEXT,
    "businessName" TEXT,
    "segment" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "stage" "LeadNurtureStage" NOT NULL DEFAULT 'CAPTURED',
    "lastContactAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "contactAttempts" INTEGER NOT NULL DEFAULT 0,
    "convertedAt" TIMESTAMP(3),
    "convertedUserId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_qr_scans" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'qr_packaging',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "orderId" TEXT,
    "discountUsed" BOOLEAN NOT NULL DEFAULT false,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "packaging_qr_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_active_idx" ON "users"("active");

-- CreateIndex
CREATE INDEX "users_subscriptionTier_idx" ON "users"("subscriptionTier");

-- CreateIndex
CREATE INDEX "users_subscriptionStatus_idx" ON "users"("subscriptionStatus");

-- CreateIndex
CREATE INDEX "users_lastSignInAt_idx" ON "users"("lastSignInAt");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE INDEX "users_currentRestaurantId_idx" ON "users"("currentRestaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "user_onboarding_userId_key" ON "user_onboarding"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "ingredient_categories_restaurantId_idx" ON "ingredient_categories"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_categories_restaurantId_name_key" ON "ingredient_categories"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "ingredients_restaurantId_idx" ON "ingredients"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_restaurantId_code_key" ON "ingredients"("restaurantId", "code");

-- CreateIndex
CREATE INDEX "suppliers_restaurantId_idx" ON "suppliers"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_restaurantId_code_key" ON "suppliers"("restaurantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_restaurantId_cnpj_key" ON "suppliers"("restaurantId", "cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_integrations_supplierId_integrationType_key" ON "supplier_integrations"("supplierId", "integrationType");

-- CreateIndex
CREATE INDEX "supplier_price_syncs_supplierId_idx" ON "supplier_price_syncs"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_price_syncs_ingredientId_idx" ON "supplier_price_syncs"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_price_syncs_supplierId_ingredientId_key" ON "supplier_price_syncs"("supplierId", "ingredientId");

-- CreateIndex
CREATE INDEX "recipes_restaurantId_idx" ON "recipes"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_restaurantId_code_key" ON "recipes"("restaurantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ingredients_recipeId_ingredientId_key" ON "recipe_ingredients"("recipeId", "ingredientId");

-- CreateIndex
CREATE INDEX "production_plans_restaurantId_idx" ON "production_plans"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "production_plans_restaurantId_planDate_key" ON "production_plans"("restaurantId", "planDate");

-- CreateIndex
CREATE INDEX "production_plan_items_restaurantId_idx" ON "production_plan_items"("restaurantId");

-- CreateIndex
CREATE INDEX "consolidated_needs_restaurantId_idx" ON "consolidated_needs"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "consolidated_needs_restaurantId_planId_ingredientId_key" ON "consolidated_needs"("restaurantId", "planId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_ingredientId_key" ON "stocks"("ingredientId");

-- CreateIndex
CREATE INDEX "stocks_restaurantId_idx" ON "stocks"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_restaurantId_ingredientId_key" ON "stocks"("restaurantId", "ingredientId");

-- CreateIndex
CREATE INDEX "stock_movements_restaurantId_idx" ON "stock_movements"("restaurantId");

-- CreateIndex
CREATE INDEX "stock_movements_ingredientId_idx" ON "stock_movements"("ingredientId");

-- CreateIndex
CREATE INDEX "waste_logs_restaurantId_idx" ON "waste_logs"("restaurantId");

-- CreateIndex
CREATE INDEX "waste_logs_ingredientId_idx" ON "waste_logs"("ingredientId");

-- CreateIndex
CREATE INDEX "inventory_adjustments_restaurantId_idx" ON "inventory_adjustments"("restaurantId");

-- CreateIndex
CREATE INDEX "adjustment_items_restaurantId_idx" ON "adjustment_items"("restaurantId");

-- CreateIndex
CREATE INDEX "shopping_lists_restaurantId_idx" ON "shopping_lists"("restaurantId");

-- CreateIndex
CREATE INDEX "shopping_list_items_restaurantId_idx" ON "shopping_list_items"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "alert_preferences_userId_alertType_key" ON "alert_preferences"("userId", "alertType");

-- CreateIndex
CREATE INDEX "audit_logs_restaurantId_idx" ON "audit_logs"("restaurantId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "invoices_restaurantId_idx" ON "invoices"("restaurantId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_ocr_results_invoiceId_key" ON "invoice_ocr_results"("invoiceId");

-- CreateIndex
CREATE INDEX "price_trends_restaurantId_idx" ON "price_trends"("restaurantId");

-- CreateIndex
CREATE INDEX "price_trends_ingredientId_idx" ON "price_trends"("ingredientId");

-- CreateIndex
CREATE INDEX "price_trends_recordedDate_idx" ON "price_trends"("recordedDate");

-- CreateIndex
CREATE INDEX "price_alerts_restaurantId_idx" ON "price_alerts"("restaurantId");

-- CreateIndex
CREATE INDEX "price_alerts_ingredientId_idx" ON "price_alerts"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "price_alerts_restaurantId_ingredientId_supplierId_alertType_key" ON "price_alerts"("restaurantId", "ingredientId", "supplierId", "alertType");

-- CreateIndex
CREATE INDEX "stock_forecasts_restaurantId_idx" ON "stock_forecasts"("restaurantId");

-- CreateIndex
CREATE INDEX "stock_forecasts_ingredientId_idx" ON "stock_forecasts"("ingredientId");

-- CreateIndex
CREATE INDEX "stock_forecasts_riskLevel_idx" ON "stock_forecasts"("riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "stock_forecasts_restaurantId_ingredientId_forecastDate_key" ON "stock_forecasts"("restaurantId", "ingredientId", "forecastDate");

-- CreateIndex
CREATE INDEX "consumption_patterns_ingredientId_idx" ON "consumption_patterns"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "consumption_patterns_ingredientId_dayOfWeek_key" ON "consumption_patterns"("ingredientId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "pos_settings_restaurantId_idx" ON "pos_settings"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_settings_restaurantId_provider_key" ON "pos_settings"("restaurantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "pos_transactions_transactionId_key" ON "pos_transactions"("transactionId");

-- CreateIndex
CREATE INDEX "pos_transactions_restaurantId_idx" ON "pos_transactions"("restaurantId");

-- CreateIndex
CREATE INDEX "pos_transactions_transactionDate_idx" ON "pos_transactions"("transactionDate");

-- CreateIndex
CREATE INDEX "pos_transactions_provider_idx" ON "pos_transactions"("provider");

-- CreateIndex
CREATE INDEX "pos_transactions_status_idx" ON "pos_transactions"("status");

-- CreateIndex
CREATE INDEX "pos_transactions_reconciled_idx" ON "pos_transactions"("reconciled");

-- CreateIndex
CREATE INDEX "pos_sale_items_transactionId_idx" ON "pos_sale_items"("transactionId");

-- CreateIndex
CREATE INDEX "pos_sale_items_recipeId_idx" ON "pos_sale_items"("recipeId");

-- CreateIndex
CREATE INDEX "demand_forecasts_ingredientId_idx" ON "demand_forecasts"("ingredientId");

-- CreateIndex
CREATE INDEX "demand_forecasts_forecastDate_idx" ON "demand_forecasts"("forecastDate");

-- CreateIndex
CREATE UNIQUE INDEX "demand_forecasts_ingredientId_forecastDate_key" ON "demand_forecasts"("ingredientId", "forecastDate");

-- CreateIndex
CREATE INDEX "smart_alert_logs_alertId_idx" ON "smart_alert_logs"("alertId");

-- CreateIndex
CREATE INDEX "smart_alert_logs_triggeredAt_idx" ON "smart_alert_logs"("triggeredAt");

-- CreateIndex
CREATE INDEX "daily_transaction_counts_userId_idx" ON "daily_transaction_counts"("userId");

-- CreateIndex
CREATE INDEX "daily_transaction_counts_date_idx" ON "daily_transaction_counts"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_transaction_counts_userId_date_key" ON "daily_transaction_counts"("userId", "date");

-- CreateIndex
CREATE INDEX "email_delivery_logs_userId_idx" ON "email_delivery_logs"("userId");

-- CreateIndex
CREATE INDEX "email_delivery_logs_emailType_idx" ON "email_delivery_logs"("emailType");

-- CreateIndex
CREATE INDEX "email_delivery_logs_status_idx" ON "email_delivery_logs"("status");

-- CreateIndex
CREATE INDEX "email_delivery_logs_sentAt_idx" ON "email_delivery_logs"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_variants_emailType_variantLabel_key" ON "email_variants"("emailType", "variantLabel");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_funnels_userId_key" ON "conversion_funnels"("userId");

-- CreateIndex
CREATE INDEX "conversion_funnels_signupDate_idx" ON "conversion_funnels"("signupDate");

-- CreateIndex
CREATE INDEX "conversion_funnels_convertedToPaidDate_idx" ON "conversion_funnels"("convertedToPaidDate");

-- CreateIndex
CREATE INDEX "conversion_funnels_conversionSource_idx" ON "conversion_funnels"("conversionSource");

-- CreateIndex
CREATE INDEX "email_feedback_userId_idx" ON "email_feedback"("userId");

-- CreateIndex
CREATE INDEX "email_feedback_emailType_idx" ON "email_feedback"("emailType");

-- CreateIndex
CREATE INDEX "email_feedback_sentiment_idx" ON "email_feedback"("sentiment");

-- CreateIndex
CREATE UNIQUE INDEX "survey_responses_userId_key" ON "survey_responses"("userId");

-- CreateIndex
CREATE INDEX "survey_responses_userId_idx" ON "survey_responses"("userId");

-- CreateIndex
CREATE INDEX "survey_responses_willingToTalk_idx" ON "survey_responses"("willingToTalk");

-- CreateIndex
CREATE INDEX "survey_responses_isWarmLead_idx" ON "survey_responses"("isWarmLead");

-- CreateIndex
CREATE INDEX "survey_responses_completedAt_idx" ON "survey_responses"("completedAt");

-- CreateIndex
CREATE INDEX "survey_responses_willingnessToPayRaw_idx" ON "survey_responses"("willingnessToPayRaw");

-- CreateIndex
CREATE INDEX "referral_history_userId_idx" ON "referral_history"("userId");

-- CreateIndex
CREATE INDEX "referral_history_referrerUserId_idx" ON "referral_history"("referrerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "email_ab_variants_testId_name_key" ON "email_ab_variants"("testId", "name");

-- CreateIndex
CREATE INDEX "email_ab_test_results_testId_idx" ON "email_ab_test_results"("testId");

-- CreateIndex
CREATE INDEX "email_ab_test_results_userId_idx" ON "email_ab_test_results"("userId");

-- CreateIndex
CREATE INDEX "email_ab_test_results_sentAt_idx" ON "email_ab_test_results"("sentAt");

-- CreateIndex
CREATE INDEX "email_campaigns_status_idx" ON "email_campaigns"("status");

-- CreateIndex
CREATE INDEX "email_campaigns_createdAt_idx" ON "email_campaigns"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_segments_campaignId_segmentType_key" ON "campaign_segments"("campaignId", "segmentType");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_ab_variants_campaignId_variantName_key" ON "campaign_ab_variants"("campaignId", "variantName");

-- CreateIndex
CREATE INDEX "campaign_schedules_campaignId_status_idx" ON "campaign_schedules"("campaignId", "status");

-- CreateIndex
CREATE INDEX "campaign_performance_campaignId_segmentId_idx" ON "campaign_performance"("campaignId", "segmentId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_performance_campaignId_segmentId_variantId_key" ON "campaign_performance"("campaignId", "segmentId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "partnership_contacts_status_idx" ON "partnership_contacts"("status");

-- CreateIndex
CREATE INDEX "partnership_contacts_contactType_idx" ON "partnership_contacts"("contactType");

-- CreateIndex
CREATE INDEX "partnership_communications_contactId_idx" ON "partnership_communications"("contactId");

-- CreateIndex
CREATE INDEX "partnership_deals_contactId_idx" ON "partnership_deals"("contactId");

-- CreateIndex
CREATE INDEX "partnership_deals_status_idx" ON "partnership_deals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "beta_testers_email_key" ON "beta_testers"("email");

-- CreateIndex
CREATE INDEX "beta_testers_status_idx" ON "beta_testers"("status");

-- CreateIndex
CREATE INDEX "beta_testers_email_idx" ON "beta_testers"("email");

-- CreateIndex
CREATE INDEX "ai_support_interactions_createdAt_idx" ON "ai_support_interactions"("createdAt");

-- CreateIndex
CREATE INDEX "ai_support_interactions_rating_idx" ON "ai_support_interactions"("rating");

-- CreateIndex
CREATE INDEX "ai_support_interactions_hallucinationFlag_idx" ON "ai_support_interactions"("hallucinationFlag");

-- CreateIndex
CREATE INDEX "ai_support_interactions_sessionId_idx" ON "ai_support_interactions"("sessionId");

-- CreateIndex
CREATE INDEX "ai_quality_alerts_createdAt_idx" ON "ai_quality_alerts"("createdAt");

-- CreateIndex
CREATE INDEX "ai_quality_alerts_resolved_idx" ON "ai_quality_alerts"("resolved");

-- CreateIndex
CREATE INDEX "ai_quality_alerts_severity_idx" ON "ai_quality_alerts"("severity");

-- CreateIndex
CREATE INDEX "beta_tester_interactions_betaTesterId_idx" ON "beta_tester_interactions"("betaTesterId");

-- CreateIndex
CREATE INDEX "delivery_integrations_restaurantId_idx" ON "delivery_integrations"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_integrations_restaurantId_platform_key" ON "delivery_integrations"("restaurantId", "platform");

-- CreateIndex
CREATE INDEX "external_orders_restaurantId_idx" ON "external_orders"("restaurantId");

-- CreateIndex
CREATE INDEX "external_orders_status_idx" ON "external_orders"("status");

-- CreateIndex
CREATE INDEX "external_orders_orderReceivedAt_idx" ON "external_orders"("orderReceivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "external_orders_restaurantId_externalOrderId_key" ON "external_orders"("restaurantId", "externalOrderId");

-- CreateIndex
CREATE INDEX "menu_item_mappings_restaurantId_idx" ON "menu_item_mappings"("restaurantId");

-- CreateIndex
CREATE INDEX "menu_item_mappings_recipeId_idx" ON "menu_item_mappings"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_mappings_restaurantId_integrationId_recipeId_key" ON "menu_item_mappings"("restaurantId", "integrationId", "recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_mappings_restaurantId_integrationId_externalItemI_key" ON "menu_item_mappings"("restaurantId", "integrationId", "externalItemId");

-- CreateIndex
CREATE INDEX "delivery_logs_externalOrderId_idx" ON "delivery_logs"("externalOrderId");

-- CreateIndex
CREATE INDEX "delivery_logs_eventTimestamp_idx" ON "delivery_logs"("eventTimestamp");

-- CreateIndex
CREATE INDEX "table_sections_restaurantId_idx" ON "table_sections"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "table_sections_restaurantId_name_key" ON "table_sections"("restaurantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tables_qrToken_key" ON "tables"("qrToken");

-- CreateIndex
CREATE INDEX "tables_restaurantId_idx" ON "tables"("restaurantId");

-- CreateIndex
CREATE INDEX "tables_sectionId_idx" ON "tables"("sectionId");

-- CreateIndex
CREATE INDEX "tables_qrToken_idx" ON "tables"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "tables_restaurantId_sectionId_number_key" ON "tables"("restaurantId", "sectionId", "number");

-- CreateIndex
CREATE INDEX "guest_profiles_restaurantId_idx" ON "guest_profiles"("restaurantId");

-- CreateIndex
CREATE INDEX "guest_profiles_email_idx" ON "guest_profiles"("email");

-- CreateIndex
CREATE INDEX "guest_profiles_phone_idx" ON "guest_profiles"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "guest_profiles_restaurantId_email_key" ON "guest_profiles"("restaurantId", "email");

-- CreateIndex
CREATE INDEX "reservations_restaurantId_idx" ON "reservations"("restaurantId");

-- CreateIndex
CREATE INDEX "reservations_guestEmail_idx" ON "reservations"("guestEmail");

-- CreateIndex
CREATE INDEX "reservations_reservedAt_idx" ON "reservations"("reservedAt");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE INDEX "reservation_reminders_reservationId_idx" ON "reservation_reminders"("reservationId");

-- CreateIndex
CREATE INDEX "reservation_reminders_sentAt_idx" ON "reservation_reminders"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_reminders_reservationId_reminderType_channel_key" ON "reservation_reminders"("reservationId", "reminderType", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "orders_externalOrderId_key" ON "orders"("externalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_restaurantId_idx" ON "orders"("restaurantId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_priority_idx" ON "orders"("priority");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");

-- CreateIndex
CREATE INDEX "orders_completedAt_idx" ON "orders"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "orders_restaurantId_orderNumber_key" ON "orders"("restaurantId", "orderNumber");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_stationId_idx" ON "order_items"("stationId");

-- CreateIndex
CREATE INDEX "order_items_status_idx" ON "order_items"("status");

-- CreateIndex
CREATE INDEX "kitchen_stations_restaurantId_idx" ON "kitchen_stations"("restaurantId");

-- CreateIndex
CREATE INDEX "order_station_assignments_stationId_idx" ON "order_station_assignments"("stationId");

-- CreateIndex
CREATE INDEX "order_station_assignments_status_idx" ON "order_station_assignments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "order_station_assignments_orderId_stationId_key" ON "order_station_assignments"("orderId", "stationId");

-- CreateIndex
CREATE INDEX "order_prep_times_orderId_idx" ON "order_prep_times"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "order_sessions_orderId_key" ON "order_sessions"("orderId");

-- CreateIndex
CREATE INDEX "order_sessions_restaurantId_idx" ON "order_sessions"("restaurantId");

-- CreateIndex
CREATE INDEX "order_sessions_status_idx" ON "order_sessions"("status");

-- CreateIndex
CREATE INDEX "order_sessions_tableId_idx" ON "order_sessions"("tableId");

-- CreateIndex
CREATE INDEX "order_sessions_userId_idx" ON "order_sessions"("userId");

-- CreateIndex
CREATE INDEX "order_sessions_createdAt_idx" ON "order_sessions"("createdAt");

-- CreateIndex
CREATE INDEX "order_session_items_sessionId_idx" ON "order_session_items"("sessionId");

-- CreateIndex
CREATE INDEX "order_session_items_recipeId_idx" ON "order_session_items"("recipeId");

-- CreateIndex
CREATE INDEX "cash_registers_restaurantId_idx" ON "cash_registers"("restaurantId");

-- CreateIndex
CREATE INDEX "cash_movements_cashRegisterId_idx" ON "cash_movements"("cashRegisterId");

-- CreateIndex
CREATE INDEX "cash_transactions_cashRegisterId_idx" ON "cash_transactions"("cashRegisterId");

-- CreateIndex
CREATE INDEX "menu_categories_restaurantId_idx" ON "menu_categories"("restaurantId");

-- CreateIndex
CREATE INDEX "menu_items_categoryId_idx" ON "menu_items"("categoryId");

-- CreateIndex
CREATE INDEX "menu_items_recipeId_idx" ON "menu_items"("recipeId");

-- CreateIndex
CREATE INDEX "menu_items_restaurantId_idx" ON "menu_items"("restaurantId");

-- CreateIndex
CREATE INDEX "menu_item_images_menuItemId_idx" ON "menu_item_images"("menuItemId");

-- CreateIndex
CREATE INDEX "payments_restaurantId_idx" ON "payments"("restaurantId");

-- CreateIndex
CREATE INDEX "payments_orderId_idx" ON "payments"("orderId");

-- CreateIndex
CREATE INDEX "payments_reservationId_idx" ON "payments"("reservationId");

-- CreateIndex
CREATE INDEX "payments_gateway_idx" ON "payments"("gateway");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- CreateIndex
CREATE INDEX "payments_restaurantId_status_idx" ON "payments"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "payments_restaurantId_createdAt_idx" ON "payments"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "payments_gateway_status_idx" ON "payments"("gateway", "status");

-- CreateIndex
CREATE INDEX "payments_status_createdAt_idx" ON "payments"("status", "createdAt");

-- CreateIndex
CREATE INDEX "payments_subscriptionId_idx" ON "payments"("subscriptionId");

-- CreateIndex
CREATE INDEX "payments_customerEmail_idx" ON "payments"("customerEmail");

-- CreateIndex
CREATE INDEX "payments_processedAt_idx" ON "payments"("processedAt");

-- CreateIndex
CREATE INDEX "payments_gatewayPaymentId_idx" ON "payments"("gatewayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "mercado_pago_transactions_paymentId_key" ON "mercado_pago_transactions"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "mercado_pago_transactions_preferenceId_key" ON "mercado_pago_transactions"("preferenceId");

-- CreateIndex
CREATE INDEX "mercado_pago_transactions_preferenceId_idx" ON "mercado_pago_transactions"("preferenceId");

-- CreateIndex
CREATE INDEX "mercado_pago_transactions_mpPaymentId_idx" ON "mercado_pago_transactions"("mpPaymentId");

-- CreateIndex
CREATE INDEX "mercado_pago_transactions_mpCollectionId_idx" ON "mercado_pago_transactions"("mpCollectionId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_transactions_paymentId_key" ON "stripe_transactions"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_transactions_stripePaymentIntentId_key" ON "stripe_transactions"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "stripe_transactions_stripePaymentIntentId_idx" ON "stripe_transactions"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "stripe_transactions_stripeChargeId_idx" ON "stripe_transactions"("stripeChargeId");

-- CreateIndex
CREATE INDEX "stripe_transactions_stripeCustomerId_idx" ON "stripe_transactions"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "stripe_transactions_stripeSubscriptionId_idx" ON "stripe_transactions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "payment_refunds_paymentId_idx" ON "payment_refunds"("paymentId");

-- CreateIndex
CREATE INDEX "payment_refunds_status_idx" ON "payment_refunds"("status");

-- CreateIndex
CREATE INDEX "payment_refunds_gatewayRefundId_idx" ON "payment_refunds"("gatewayRefundId");

-- CreateIndex
CREATE INDEX "subscriptions_restaurantId_idx" ON "subscriptions"("restaurantId");

-- CreateIndex
CREATE INDEX "subscriptions_userId_idx" ON "subscriptions"("userId");

-- CreateIndex
CREATE INDEX "subscriptions_gatewaySubscriptionId_idx" ON "subscriptions"("gatewaySubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_currentPeriodEnd_idx" ON "subscriptions"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "subscriptions_restaurantId_status_idx" ON "subscriptions"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_tier_idx" ON "subscriptions"("tier");

-- CreateIndex
CREATE INDEX "subscriptions_gateway_idx" ON "subscriptions"("gateway");

-- CreateIndex
CREATE INDEX "subscriptions_cancelledAt_idx" ON "subscriptions"("cancelledAt");

-- CreateIndex
CREATE INDEX "subscriptions_createdAt_idx" ON "subscriptions"("createdAt");

-- CreateIndex
CREATE INDEX "settlements_restaurantId_idx" ON "settlements"("restaurantId");

-- CreateIndex
CREATE INDEX "settlements_gateway_idx" ON "settlements"("gateway");

-- CreateIndex
CREATE INDEX "settlements_status_idx" ON "settlements"("status");

-- CreateIndex
CREATE INDEX "settlements_gatewayTransferId_idx" ON "settlements"("gatewayTransferId");

-- CreateIndex
CREATE INDEX "item_modifiers_restaurantId_idx" ON "item_modifiers"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "order_session_item_modifiers_sessionItemId_modifierId_key" ON "order_session_item_modifiers"("sessionItemId", "modifierId");

-- CreateIndex
CREATE UNIQUE INDEX "order_item_modifiers_orderItemId_modifierId_key" ON "order_item_modifiers"("orderItemId", "modifierId");

-- CreateIndex
CREATE UNIQUE INDEX "nfe_configs_restaurantId_key" ON "nfe_configs"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "nfe_configs_cnpj_key" ON "nfe_configs"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "nfe_documents_accessKey_key" ON "nfe_documents"("accessKey");

-- CreateIndex
CREATE UNIQUE INDEX "nfe_documents_providerRef_key" ON "nfe_documents"("providerRef");

-- CreateIndex
CREATE INDEX "nfe_documents_status_idx" ON "nfe_documents"("status");

-- CreateIndex
CREATE INDEX "nfe_documents_issueDate_idx" ON "nfe_documents"("issueDate");

-- CreateIndex
CREATE INDEX "nfe_documents_orderId_idx" ON "nfe_documents"("orderId");

-- CreateIndex
CREATE INDEX "nfe_documents_orderSessionId_idx" ON "nfe_documents"("orderSessionId");

-- CreateIndex
CREATE INDEX "nfe_items_documentId_idx" ON "nfe_items"("documentId");

-- CreateIndex
CREATE INDEX "nfe_logs_configId_idx" ON "nfe_logs"("configId");

-- CreateIndex
CREATE INDEX "nfe_logs_documentId_idx" ON "nfe_logs"("documentId");

-- CreateIndex
CREATE INDEX "nfe_logs_eventType_idx" ON "nfe_logs"("eventType");

-- CreateIndex
CREATE INDEX "ingredient_batches_ingredientId_idx" ON "ingredient_batches"("ingredientId");

-- CreateIndex
CREATE INDEX "ingredient_batches_expirationDate_idx" ON "ingredient_batches"("expirationDate");

-- CreateIndex
CREATE INDEX "ingredient_batches_batchNumber_idx" ON "ingredient_batches"("batchNumber");

-- CreateIndex
CREATE INDEX "ingredient_traces_batchId_idx" ON "ingredient_traces"("batchId");

-- CreateIndex
CREATE INDEX "ingredient_traces_orderId_idx" ON "ingredient_traces"("orderId");

-- CreateIndex
CREATE INDEX "ingredient_traces_createdAt_idx" ON "ingredient_traces"("createdAt");

-- CreateIndex
CREATE INDEX "order_traces_orderId_idx" ON "order_traces"("orderId");

-- CreateIndex
CREATE INDEX "order_traces_batchId_idx" ON "order_traces"("batchId");

-- CreateIndex
CREATE INDEX "order_traces_recordedAt_idx" ON "order_traces"("recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_segment_idx" ON "customers"("segment");

-- CreateIndex
CREATE INDEX "customers_lastOrderAt_idx" ON "customers"("lastOrderAt");

-- CreateIndex
CREATE INDEX "customers_createdAt_idx" ON "customers"("createdAt");

-- CreateIndex
CREATE INDEX "customers_restaurantId_idx" ON "customers"("restaurantId");

-- CreateIndex
CREATE INDEX "customer_interactions_customerId_idx" ON "customer_interactions"("customerId");

-- CreateIndex
CREATE INDEX "customer_interactions_type_idx" ON "customer_interactions"("type");

-- CreateIndex
CREATE INDEX "customer_interactions_status_idx" ON "customer_interactions"("status");

-- CreateIndex
CREATE INDEX "customer_interactions_followUpDate_idx" ON "customer_interactions"("followUpDate");

-- CreateIndex
CREATE INDEX "customer_interactions_createdAt_idx" ON "customer_interactions"("createdAt");

-- CreateIndex
CREATE INDEX "loyalty_programs_active_idx" ON "loyalty_programs"("active");

-- CreateIndex
CREATE INDEX "loyalty_programs_createdAt_idx" ON "loyalty_programs"("createdAt");

-- CreateIndex
CREATE INDEX "loyalty_programs_restaurantId_idx" ON "loyalty_programs"("restaurantId");

-- CreateIndex
CREATE INDEX "customer_loyalty_accounts_customerId_idx" ON "customer_loyalty_accounts"("customerId");

-- CreateIndex
CREATE INDEX "customer_loyalty_accounts_programId_idx" ON "customer_loyalty_accounts"("programId");

-- CreateIndex
CREATE INDEX "customer_loyalty_accounts_tier_idx" ON "customer_loyalty_accounts"("tier");

-- CreateIndex
CREATE INDEX "customer_loyalty_accounts_currentPoints_idx" ON "customer_loyalty_accounts"("currentPoints");

-- CreateIndex
CREATE INDEX "customer_loyalty_accounts_lastActivityAt_idx" ON "customer_loyalty_accounts"("lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_loyalty_accounts_customerId_programId_key" ON "customer_loyalty_accounts"("customerId", "programId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_customerId_idx" ON "loyalty_transactions"("customerId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_accountId_idx" ON "loyalty_transactions"("accountId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_type_idx" ON "loyalty_transactions"("type");

-- CreateIndex
CREATE INDEX "loyalty_transactions_orderId_idx" ON "loyalty_transactions"("orderId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_createdAt_idx" ON "loyalty_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "loyalty_rewards_programId_idx" ON "loyalty_rewards"("programId");

-- CreateIndex
CREATE INDEX "loyalty_rewards_active_idx" ON "loyalty_rewards"("active");

-- CreateIndex
CREATE INDEX "loyalty_rewards_pointsCost_idx" ON "loyalty_rewards"("pointsCost");

-- CreateIndex
CREATE INDEX "loyalty_rewards_createdAt_idx" ON "loyalty_rewards"("createdAt");

-- CreateIndex
CREATE INDEX "cash_flow_records_type_idx" ON "cash_flow_records"("type");

-- CreateIndex
CREATE INDEX "cash_flow_records_category_idx" ON "cash_flow_records"("category");

-- CreateIndex
CREATE INDEX "cash_flow_records_date_idx" ON "cash_flow_records"("date");

-- CreateIndex
CREATE INDEX "cash_flow_records_status_idx" ON "cash_flow_records"("status");

-- CreateIndex
CREATE INDEX "financial_metrics_metricType_idx" ON "financial_metrics"("metricType");

-- CreateIndex
CREATE INDEX "financial_metrics_date_idx" ON "financial_metrics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "financial_metrics_metricType_period_date_key" ON "financial_metrics"("metricType", "period", "date");

-- CreateIndex
CREATE INDEX "financial_forecasts_forecastType_idx" ON "financial_forecasts"("forecastType");

-- CreateIndex
CREATE INDEX "financial_forecasts_startDate_idx" ON "financial_forecasts"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_userId_key" ON "staff_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_cpf_key" ON "staff_members"("cpf");

-- CreateIndex
CREATE INDEX "staff_shifts_shiftDate_idx" ON "staff_shifts"("shiftDate");

-- CreateIndex
CREATE INDEX "staff_shifts_staffMemberId_idx" ON "staff_shifts"("staffMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_shifts_staffMemberId_shiftDate_key" ON "staff_shifts"("staffMemberId", "shiftDate");

-- CreateIndex
CREATE INDEX "staff_commissions_period_idx" ON "staff_commissions"("period");

-- CreateIndex
CREATE INDEX "staff_commissions_status_idx" ON "staff_commissions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_commissions_staffMemberId_period_key" ON "staff_commissions"("staffMemberId", "period");

-- CreateIndex
CREATE INDEX "admin_logs_userId_idx" ON "admin_logs"("userId");

-- CreateIndex
CREATE INDEX "admin_logs_action_idx" ON "admin_logs"("action");

-- CreateIndex
CREATE INDEX "admin_logs_entityType_idx" ON "admin_logs"("entityType");

-- CreateIndex
CREATE INDEX "admin_logs_createdAt_idx" ON "admin_logs"("createdAt");

-- CreateIndex
CREATE INDEX "admin_logs_entityId_idx" ON "admin_logs"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "metric_snapshots_snapshotDate_key" ON "metric_snapshots"("snapshotDate");

-- CreateIndex
CREATE INDEX "metric_snapshots_snapshotDate_idx" ON "metric_snapshots"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "customer_segments_customerId_key" ON "customer_segments"("customerId");

-- CreateIndex
CREATE INDEX "customer_segments_segment_idx" ON "customer_segments"("segment");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_severity_idx" ON "Notification"("severity");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Notification_restaurantId_idx" ON "Notification"("restaurantId");

-- CreateIndex
CREATE INDEX "Notification_archived_idx" ON "Notification"("archived");

-- CreateIndex
CREATE INDEX "Notification_userId_read_archived_idx" ON "Notification"("userId", "read", "archived");

-- CreateIndex
CREATE INDEX "Notification_restaurantId_createdAt_idx" ON "Notification"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_cnpj_key" ON "restaurants"("cnpj");

-- CreateIndex
CREATE INDEX "restaurants_status_idx" ON "restaurants"("status");

-- CreateIndex
CREATE INDEX "restaurants_subscriptionStatus_idx" ON "restaurants"("subscriptionStatus");

-- CreateIndex
CREATE INDEX "restaurants_createdAt_idx" ON "restaurants"("createdAt");

-- CreateIndex
CREATE INDEX "restaurants_subscriptionTier_idx" ON "restaurants"("subscriptionTier");

-- CreateIndex
CREATE INDEX "restaurants_ownerId_idx" ON "restaurants"("ownerId");

-- CreateIndex
CREATE INDEX "restaurants_trialEndsAt_idx" ON "restaurants"("trialEndsAt");

-- CreateIndex
CREATE INDEX "restaurant_users_restaurantId_idx" ON "restaurant_users"("restaurantId");

-- CreateIndex
CREATE INDEX "restaurant_users_userId_idx" ON "restaurant_users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_users_restaurantId_userId_key" ON "restaurant_users"("restaurantId", "userId");

-- CreateIndex
CREATE INDEX "chart_of_accounts_restaurantId_type_idx" ON "chart_of_accounts"("restaurantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_restaurantId_code_key" ON "chart_of_accounts"("restaurantId", "code");

-- CreateIndex
CREATE INDEX "income_categories_restaurantId_idx" ON "income_categories"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "income_categories_restaurantId_name_key" ON "income_categories"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "expense_categories_restaurantId_idx" ON "expense_categories"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_restaurantId_name_key" ON "expense_categories"("restaurantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "help_categories_slug_key" ON "help_categories"("slug");

-- CreateIndex
CREATE INDEX "help_categories_visible_order_idx" ON "help_categories"("visible", "order");

-- CreateIndex
CREATE UNIQUE INDEX "help_articles_slug_key" ON "help_articles"("slug");

-- CreateIndex
CREATE INDEX "help_articles_categoryId_idx" ON "help_articles"("categoryId");

-- CreateIndex
CREATE INDEX "help_articles_published_featured_idx" ON "help_articles"("published", "featured");

-- CreateIndex
CREATE INDEX "help_articles_published_publishedAt_idx" ON "help_articles"("published", "publishedAt");

-- CreateIndex
CREATE INDEX "help_articles_slug_idx" ON "help_articles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_number_key" ON "support_tickets"("number");

-- CreateIndex
CREATE INDEX "support_tickets_userId_idx" ON "support_tickets"("userId");

-- CreateIndex
CREATE INDEX "support_tickets_restaurantId_idx" ON "support_tickets"("restaurantId");

-- CreateIndex
CREATE INDEX "support_tickets_assignedToId_idx" ON "support_tickets"("assignedToId");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "support_tickets_priority_idx" ON "support_tickets"("priority");

-- CreateIndex
CREATE INDEX "support_tickets_category_idx" ON "support_tickets"("category");

-- CreateIndex
CREATE INDEX "support_tickets_createdAt_idx" ON "support_tickets"("createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_lastActivityAt_idx" ON "support_tickets"("lastActivityAt");

-- CreateIndex
CREATE INDEX "support_tickets_status_priority_idx" ON "support_tickets"("status", "priority");

-- CreateIndex
CREATE INDEX "support_tickets_status_createdAt_idx" ON "support_tickets"("status", "createdAt");

-- CreateIndex
CREATE INDEX "support_messages_ticketId_idx" ON "support_messages"("ticketId");

-- CreateIndex
CREATE INDEX "support_messages_senderId_idx" ON "support_messages"("senderId");

-- CreateIndex
CREATE INDEX "support_messages_ticketId_createdAt_idx" ON "support_messages"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_number_key" ON "billing_invoices"("number");

-- CreateIndex
CREATE INDEX "billing_invoices_restaurantId_idx" ON "billing_invoices"("restaurantId");

-- CreateIndex
CREATE INDEX "billing_invoices_userId_idx" ON "billing_invoices"("userId");

-- CreateIndex
CREATE INDEX "billing_invoices_subscriptionId_idx" ON "billing_invoices"("subscriptionId");

-- CreateIndex
CREATE INDEX "billing_invoices_status_idx" ON "billing_invoices"("status");

-- CreateIndex
CREATE INDEX "billing_invoices_dueDate_idx" ON "billing_invoices"("dueDate");

-- CreateIndex
CREATE INDEX "billing_invoices_createdAt_idx" ON "billing_invoices"("createdAt");

-- CreateIndex
CREATE INDEX "billing_invoices_userId_status_idx" ON "billing_invoices"("userId", "status");

-- CreateIndex
CREATE INDEX "billing_invoices_restaurantId_status_idx" ON "billing_invoices"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "feedback_restaurantId_idx" ON "feedback"("restaurantId");

-- CreateIndex
CREATE INDEX "feedback_userId_idx" ON "feedback"("userId");

-- CreateIndex
CREATE INDEX "feedback_type_idx" ON "feedback"("type");

-- CreateIndex
CREATE INDEX "feedback_status_idx" ON "feedback"("status");

-- CreateIndex
CREATE INDEX "feedback_createdAt_idx" ON "feedback"("createdAt");

-- CreateIndex
CREATE INDEX "feedback_type_createdAt_idx" ON "feedback"("type", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_status_createdAt_idx" ON "feedback"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "feature_requests_slug_key" ON "feature_requests"("slug");

-- CreateIndex
CREATE INDEX "feature_requests_status_idx" ON "feature_requests"("status");

-- CreateIndex
CREATE INDEX "feature_requests_priority_idx" ON "feature_requests"("priority");

-- CreateIndex
CREATE INDEX "feature_requests_category_idx" ON "feature_requests"("category");

-- CreateIndex
CREATE INDEX "feature_requests_isPublic_idx" ON "feature_requests"("isPublic");

-- CreateIndex
CREATE INDEX "feature_requests_voteCount_idx" ON "feature_requests"("voteCount");

-- CreateIndex
CREATE INDEX "feature_requests_createdAt_idx" ON "feature_requests"("createdAt");

-- CreateIndex
CREATE INDEX "feature_requests_status_priority_idx" ON "feature_requests"("status", "priority");

-- CreateIndex
CREATE INDEX "feature_votes_featureRequestId_idx" ON "feature_votes"("featureRequestId");

-- CreateIndex
CREATE INDEX "feature_votes_userId_idx" ON "feature_votes"("userId");

-- CreateIndex
CREATE INDEX "feature_votes_createdAt_idx" ON "feature_votes"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "feature_votes_featureRequestId_userId_key" ON "feature_votes"("featureRequestId", "userId");

-- CreateIndex
CREATE INDEX "ai_insights_restaurantId_createdAt_idx" ON "ai_insights"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_insights_type_createdAt_idx" ON "ai_insights"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ai_insights_pinned_idx" ON "ai_insights"("pinned");

-- CreateIndex
CREATE INDEX "loyalty_milestones_programId_active_idx" ON "loyalty_milestones"("programId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_milestones_programId_orderCount_key" ON "loyalty_milestones"("programId", "orderCount");

-- CreateIndex
CREATE INDEX "loyalty_milestone_redemptions_milestoneId_customerId_idx" ON "loyalty_milestone_redemptions"("milestoneId", "customerId");

-- CreateIndex
CREATE INDEX "loyalty_milestone_redemptions_customerId_idx" ON "loyalty_milestone_redemptions"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_configs_restaurantId_key" ON "whatsapp_configs"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_orderSessionId_key" ON "whatsapp_conversations"("orderSessionId");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_restaurantId_idx" ON "whatsapp_conversations"("restaurantId");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_state_idx" ON "whatsapp_conversations"("state");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_phoneNumber_idx" ON "whatsapp_conversations"("phoneNumber");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_lastMessageAt_idx" ON "whatsapp_conversations"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_restaurantId_phoneNumber_key" ON "whatsapp_conversations"("restaurantId", "phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_waMessageId_key" ON "whatsapp_messages"("waMessageId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversationId_idx" ON "whatsapp_messages"("conversationId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_createdAt_idx" ON "whatsapp_messages"("createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_waMessageId_idx" ON "whatsapp_messages"("waMessageId");

-- CreateIndex
CREATE INDEX "cmv_snapshots_restaurantId_periodEnd_idx" ON "cmv_snapshots"("restaurantId", "periodEnd");

-- CreateIndex
CREATE INDEX "cmv_snapshots_alertLevel_idx" ON "cmv_snapshots"("alertLevel");

-- CreateIndex
CREATE INDEX "menu_engineering_snapshots_restaurantId_periodEnd_idx" ON "menu_engineering_snapshots"("restaurantId", "periodEnd");

-- CreateIndex
CREATE INDEX "menu_engineering_snapshots_recipeId_idx" ON "menu_engineering_snapshots"("recipeId");

-- CreateIndex
CREATE INDEX "menu_engineering_snapshots_classification_idx" ON "menu_engineering_snapshots"("classification");

-- CreateIndex
CREATE UNIQUE INDEX "voice_agent_configs_restaurantId_key" ON "voice_agent_configs"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "voice_calls_callSid_key" ON "voice_calls"("callSid");

-- CreateIndex
CREATE INDEX "voice_calls_restaurantId_idx" ON "voice_calls"("restaurantId");

-- CreateIndex
CREATE INDEX "voice_calls_status_idx" ON "voice_calls"("status");

-- CreateIndex
CREATE INDEX "voice_calls_startedAt_idx" ON "voice_calls"("startedAt");

-- CreateIndex
CREATE INDEX "voice_calls_reservationId_idx" ON "voice_calls"("reservationId");

-- CreateIndex
CREATE INDEX "messaging_provider_configs_restaurantId_idx" ON "messaging_provider_configs"("restaurantId");

-- CreateIndex
CREATE INDEX "messaging_provider_configs_provider_idx" ON "messaging_provider_configs"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_provider_configs_restaurantId_provider_key" ON "messaging_provider_configs"("restaurantId", "provider");

-- CreateIndex
CREATE INDEX "message_templates_restaurantId_idx" ON "message_templates"("restaurantId");

-- CreateIndex
CREATE INDEX "message_templates_status_idx" ON "message_templates"("status");

-- CreateIndex
CREATE INDEX "message_templates_category_idx" ON "message_templates"("category");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_restaurantId_name_key" ON "message_templates"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "message_campaigns_restaurantId_idx" ON "message_campaigns"("restaurantId");

-- CreateIndex
CREATE INDEX "message_campaigns_status_idx" ON "message_campaigns"("status");

-- CreateIndex
CREATE INDEX "message_campaigns_scheduledAt_idx" ON "message_campaigns"("scheduledAt");

-- CreateIndex
CREATE INDEX "message_campaigns_templateId_idx" ON "message_campaigns"("templateId");

-- CreateIndex
CREATE INDEX "message_campaign_recipients_campaignId_idx" ON "message_campaign_recipients"("campaignId");

-- CreateIndex
CREATE INDEX "message_campaign_recipients_status_idx" ON "message_campaign_recipients"("status");

-- CreateIndex
CREATE INDEX "message_campaign_recipients_phoneNumber_idx" ON "message_campaign_recipients"("phoneNumber");

-- CreateIndex
CREATE INDEX "message_campaign_recipients_providerMsgId_idx" ON "message_campaign_recipients"("providerMsgId");

-- CreateIndex
CREATE INDEX "marketing_leads_source_idx" ON "marketing_leads"("source");

-- CreateIndex
CREATE INDEX "marketing_leads_status_idx" ON "marketing_leads"("status");

-- CreateIndex
CREATE INDEX "marketing_leads_stage_idx" ON "marketing_leads"("stage");

-- CreateIndex
CREATE INDEX "marketing_leads_score_idx" ON "marketing_leads"("score");

-- CreateIndex
CREATE INDEX "marketing_leads_createdAt_idx" ON "marketing_leads"("createdAt");

-- CreateIndex
CREATE INDEX "marketing_leads_phoneNumber_idx" ON "marketing_leads"("phoneNumber");

-- CreateIndex
CREATE INDEX "marketing_leads_email_idx" ON "marketing_leads"("email");

-- CreateIndex
CREATE INDEX "marketing_leads_segment_idx" ON "marketing_leads"("segment");

-- CreateIndex
CREATE INDEX "marketing_leads_restaurantId_idx" ON "marketing_leads"("restaurantId");

-- CreateIndex
CREATE INDEX "packaging_qr_scans_restaurantId_idx" ON "packaging_qr_scans"("restaurantId");

-- CreateIndex
CREATE INDEX "packaging_qr_scans_scannedAt_idx" ON "packaging_qr_scans"("scannedAt");

-- CreateIndex
CREATE INDEX "packaging_qr_scans_converted_idx" ON "packaging_qr_scans"("converted");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_categories" ADD CONSTRAINT "ingredient_categories_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ingredient_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_suppliers" ADD CONSTRAINT "ingredient_suppliers_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_suppliers" ADD CONSTRAINT "ingredient_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_integrations" ADD CONSTRAINT "supplier_integrations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_syncs" ADD CONSTRAINT "supplier_price_syncs_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_syncs" ADD CONSTRAINT "supplier_price_syncs_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_scales" ADD CONSTRAINT "recipe_scales_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scaled_ingredients" ADD CONSTRAINT "scaled_ingredients_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "recipe_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plan_items" ADD CONSTRAINT "production_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "production_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plan_items" ADD CONSTRAINT "production_plan_items_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plan_items" ADD CONSTRAINT "production_plan_items_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidated_needs" ADD CONSTRAINT "consolidated_needs_planId_fkey" FOREIGN KEY ("planId") REFERENCES "production_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidated_needs" ADD CONSTRAINT "consolidated_needs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_logs" ADD CONSTRAINT "waste_logs_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_logs" ADD CONSTRAINT "waste_logs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustment_items" ADD CONSTRAINT "adjustment_items_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "inventory_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustment_items" ADD CONSTRAINT "adjustment_items_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "ingredient_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_preferences" ADD CONSTRAINT "alert_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_ocr_results" ADD CONSTRAINT "invoice_ocr_results_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_trends" ADD CONSTRAINT "price_trends_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_trends" ADD CONSTRAINT "price_trends_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_trends" ADD CONSTRAINT "price_trends_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "ingredient_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "ingredient_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_forecasts" ADD CONSTRAINT "stock_forecasts_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_forecasts" ADD CONSTRAINT "stock_forecasts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumption_patterns" ADD CONSTRAINT "consumption_patterns_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumption_patterns" ADD CONSTRAINT "consumption_patterns_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_settings" ADD CONSTRAINT "pos_settings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_transactions" ADD CONSTRAINT "pos_transactions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "pos_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecasts" ADD CONSTRAINT "demand_forecasts_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecasts" ADD CONSTRAINT "demand_forecasts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_alerts" ADD CONSTRAINT "smart_alerts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_alert_logs" ADD CONSTRAINT "smart_alert_logs_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "smart_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_transaction_counts" ADD CONSTRAINT "daily_transaction_counts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_feedback" ADD CONSTRAINT "email_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_history" ADD CONSTRAINT "referral_history_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_history" ADD CONSTRAINT "referral_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_ab_variants" ADD CONSTRAINT "email_ab_variants_testId_fkey" FOREIGN KEY ("testId") REFERENCES "email_ab_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_ab_test_results" ADD CONSTRAINT "email_ab_test_results_testId_fkey" FOREIGN KEY ("testId") REFERENCES "email_ab_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_ab_test_results" ADD CONSTRAINT "email_ab_test_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_segments" ADD CONSTRAINT "campaign_segments_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_ab_variants" ADD CONSTRAINT "campaign_ab_variants_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_schedules" ADD CONSTRAINT "campaign_schedules_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_performance" ADD CONSTRAINT "campaign_performance_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_performance" ADD CONSTRAINT "campaign_performance_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "campaign_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_performance" ADD CONSTRAINT "campaign_performance_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "campaign_ab_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnership_communications" ADD CONSTRAINT "partnership_communications_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "partnership_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnership_deals" ADD CONSTRAINT "partnership_deals_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "partnership_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beta_tester_interactions" ADD CONSTRAINT "beta_tester_interactions_betaTesterId_fkey" FOREIGN KEY ("betaTesterId") REFERENCES "beta_testers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_integrations" ADD CONSTRAINT "delivery_integrations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_orders" ADD CONSTRAINT "external_orders_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "delivery_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_orders" ADD CONSTRAINT "external_orders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_mappings" ADD CONSTRAINT "menu_item_mappings_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "delivery_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_mappings" ADD CONSTRAINT "menu_item_mappings_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_mappings" ADD CONSTRAINT "menu_item_mappings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_logs" ADD CONSTRAINT "delivery_logs_externalOrderId_fkey" FOREIGN KEY ("externalOrderId") REFERENCES "external_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sections" ADD CONSTRAINT "table_sections_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "table_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_profiles" ADD CONSTRAINT "guest_profiles_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guest_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_reminders" ADD CONSTRAINT "reservation_reminders_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guest_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_reminders" ADD CONSTRAINT "reservation_reminders_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_externalOrderId_fkey" FOREIGN KEY ("externalOrderId") REFERENCES "external_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "kitchen_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_station_assignments" ADD CONSTRAINT "order_station_assignments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_station_assignments" ADD CONSTRAINT "order_station_assignments_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "kitchen_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_prep_times" ADD CONSTRAINT "order_prep_times_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sessions" ADD CONSTRAINT "order_sessions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sessions" ADD CONSTRAINT "order_sessions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sessions" ADD CONSTRAINT "order_sessions_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sessions" ADD CONSTRAINT "order_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_session_items" ADD CONSTRAINT "order_session_items_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_session_items" ADD CONSTRAINT "order_session_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "order_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_images" ADD CONSTRAINT "menu_item_images_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mercado_pago_transactions" ADD CONSTRAINT "mercado_pago_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_transactions" ADD CONSTRAINT "stripe_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_session_item_modifiers" ADD CONSTRAINT "order_session_item_modifiers_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "item_modifiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_session_item_modifiers" ADD CONSTRAINT "order_session_item_modifiers_sessionItemId_fkey" FOREIGN KEY ("sessionItemId") REFERENCES "order_session_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "item_modifiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_configs" ADD CONSTRAINT "nfe_configs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_documents" ADD CONSTRAINT "nfe_documents_configId_fkey" FOREIGN KEY ("configId") REFERENCES "nfe_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_items" ADD CONSTRAINT "nfe_items_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "nfe_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_logs" ADD CONSTRAINT "nfe_logs_configId_fkey" FOREIGN KEY ("configId") REFERENCES "nfe_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_logs" ADD CONSTRAINT "nfe_logs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "nfe_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_batches" ADD CONSTRAINT "ingredient_batches_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_batches" ADD CONSTRAINT "ingredient_batches_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "ingredient_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_traces" ADD CONSTRAINT "ingredient_traces_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ingredient_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_traces" ADD CONSTRAINT "order_traces_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ingredient_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_traces" ADD CONSTRAINT "order_traces_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_traces" ADD CONSTRAINT "order_traces_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_loyalty_accounts" ADD CONSTRAINT "customer_loyalty_accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_loyalty_accounts" ADD CONSTRAINT "customer_loyalty_accounts_programId_fkey" FOREIGN KEY ("programId") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "customer_loyalty_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "loyalty_rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_programId_fkey" FOREIGN KEY ("programId") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_records" ADD CONSTRAINT "cash_flow_records_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_commissions" ADD CONSTRAINT "staff_commissions_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_segments" ADD CONSTRAINT "customer_segments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_users" ADD CONSTRAINT "restaurant_users_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_users" ADD CONSTRAINT "restaurant_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_categories" ADD CONSTRAINT "income_categories_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "help_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_featureRequestId_fkey" FOREIGN KEY ("featureRequestId") REFERENCES "feature_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_votes" ADD CONSTRAINT "feature_votes_featureRequestId_fkey" FOREIGN KEY ("featureRequestId") REFERENCES "feature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_votes" ADD CONSTRAINT "feature_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_milestones" ADD CONSTRAINT "loyalty_milestones_programId_fkey" FOREIGN KEY ("programId") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_configs" ADD CONSTRAINT "whatsapp_configs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_orderSessionId_fkey" FOREIGN KEY ("orderSessionId") REFERENCES "order_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmv_snapshots" ADD CONSTRAINT "cmv_snapshots_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_engineering_snapshots" ADD CONSTRAINT "menu_engineering_snapshots_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_engineering_snapshots" ADD CONSTRAINT "menu_engineering_snapshots_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_agent_configs" ADD CONSTRAINT "voice_agent_configs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_provider_configs" ADD CONSTRAINT "messaging_provider_configs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_campaigns" ADD CONSTRAINT "message_campaigns_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_campaigns" ADD CONSTRAINT "message_campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_campaign_recipients" ADD CONSTRAINT "message_campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "message_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_leads" ADD CONSTRAINT "marketing_leads_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_qr_scans" ADD CONSTRAINT "packaging_qr_scans_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

