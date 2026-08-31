-- The database was originally provisioned via `prisma db push` against a
-- fresh Supabase project. That push silently dropped almost every non-PK
-- index and foreign key across the schema (most likely the connection
-- pooler choking on one very large multi-statement DDL batch), leaving only
-- primary keys in place. This surfaced as production 500s wherever code
-- relies on a unique constraint (e.g. prisma.restaurantUser.upsert() on
-- (restaurantId, userId), prisma.staffMember.upsert() on userId) -
-- Postgres rejects the ON CONFLICT clause outright (42P10) when the
-- matching constraint doesn't exist.
--
-- This migration is the exact output of:
--   prisma migrate diff --from-url <production DIRECT_URL>
--     --to-schema-datamodel prisma/schema.prisma --script
-- i.e. everything schema.prisma declares that the live database was
-- actually missing. Every statement is additive (CREATE INDEX /
-- ADD FOREIGN KEY) with the same ON DELETE semantics already declared in
-- schema.prisma - no data is modified or dropped. Verified before writing
-- this migration: no duplicate (restaurantId, userId) rows exist in
-- restaurant_users, so the new unique index is safe to add.

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
CREATE INDEX "ai_insights_restaurantId_createdAt_idx" ON "ai_insights"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_insights_type_createdAt_idx" ON "ai_insights"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ai_insights_pinned_idx" ON "ai_insights"("pinned");

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
CREATE INDEX "cash_flow_records_type_idx" ON "cash_flow_records"("type");

-- CreateIndex
CREATE INDEX "cash_flow_records_category_idx" ON "cash_flow_records"("category");

-- CreateIndex
CREATE INDEX "cash_flow_records_date_idx" ON "cash_flow_records"("date");

-- CreateIndex
CREATE INDEX "cash_flow_records_status_idx" ON "cash_flow_records"("status");

-- CreateIndex
CREATE INDEX "chart_of_accounts_restaurantId_type_idx" ON "chart_of_accounts"("restaurantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_restaurantId_code_key" ON "chart_of_accounts"("restaurantId", "code");

-- CreateIndex
CREATE INDEX "cmv_snapshots_restaurantId_periodEnd_idx" ON "cmv_snapshots"("restaurantId", "periodEnd");

-- CreateIndex
CREATE INDEX "cmv_snapshots_alertLevel_idx" ON "cmv_snapshots"("alertLevel");

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
CREATE UNIQUE INDEX "customer_segments_customerId_key" ON "customer_segments"("customerId");

-- CreateIndex
CREATE INDEX "customer_segments_segment_idx" ON "customer_segments"("segment");

-- CreateIndex
CREATE INDEX "customers_createdAt_idx" ON "customers"("createdAt");

-- CreateIndex
CREATE INDEX "customers_restaurantId_idx" ON "customers"("restaurantId");

-- CreateIndex
CREATE INDEX "expense_categories_restaurantId_idx" ON "expense_categories"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_restaurantId_name_key" ON "expense_categories"("restaurantId", "name");

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
CREATE INDEX "financial_forecasts_forecastType_idx" ON "financial_forecasts"("forecastType");

-- CreateIndex
CREATE INDEX "financial_forecasts_startDate_idx" ON "financial_forecasts"("startDate");

-- CreateIndex
CREATE INDEX "financial_metrics_metricType_idx" ON "financial_metrics"("metricType");

-- CreateIndex
CREATE INDEX "financial_metrics_date_idx" ON "financial_metrics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "financial_metrics_metricType_period_date_key" ON "financial_metrics"("metricType", "period", "date");

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
CREATE UNIQUE INDEX "help_categories_slug_key" ON "help_categories"("slug");

-- CreateIndex
CREATE INDEX "help_categories_visible_order_idx" ON "help_categories"("visible", "order");

-- CreateIndex
CREATE INDEX "income_categories_restaurantId_idx" ON "income_categories"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "income_categories_restaurantId_name_key" ON "income_categories"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "loyalty_milestone_redemptions_milestoneId_customerId_idx" ON "loyalty_milestone_redemptions"("milestoneId", "customerId");

-- CreateIndex
CREATE INDEX "loyalty_milestone_redemptions_customerId_idx" ON "loyalty_milestone_redemptions"("customerId");

-- CreateIndex
CREATE INDEX "loyalty_milestones_programId_active_idx" ON "loyalty_milestones"("programId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_milestones_programId_orderCount_key" ON "loyalty_milestones"("programId", "orderCount");

-- CreateIndex
CREATE INDEX "loyalty_programs_active_idx" ON "loyalty_programs"("active");

-- CreateIndex
CREATE INDEX "loyalty_programs_createdAt_idx" ON "loyalty_programs"("createdAt");

-- CreateIndex
CREATE INDEX "loyalty_programs_restaurantId_idx" ON "loyalty_programs"("restaurantId");

-- CreateIndex
CREATE INDEX "loyalty_rewards_programId_idx" ON "loyalty_rewards"("programId");

-- CreateIndex
CREATE INDEX "loyalty_rewards_active_idx" ON "loyalty_rewards"("active");

-- CreateIndex
CREATE INDEX "loyalty_rewards_pointsCost_idx" ON "loyalty_rewards"("pointsCost");

-- CreateIndex
CREATE INDEX "loyalty_rewards_createdAt_idx" ON "loyalty_rewards"("createdAt");

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
CREATE INDEX "menu_engineering_snapshots_restaurantId_periodEnd_idx" ON "menu_engineering_snapshots"("restaurantId", "periodEnd");

-- CreateIndex
CREATE INDEX "menu_engineering_snapshots_recipeId_idx" ON "menu_engineering_snapshots"("recipeId");

-- CreateIndex
CREATE INDEX "menu_engineering_snapshots_classification_idx" ON "menu_engineering_snapshots"("classification");

-- CreateIndex
CREATE INDEX "message_campaign_recipients_campaignId_idx" ON "message_campaign_recipients"("campaignId");

-- CreateIndex
CREATE INDEX "message_campaign_recipients_status_idx" ON "message_campaign_recipients"("status");

-- CreateIndex
CREATE INDEX "message_campaign_recipients_phoneNumber_idx" ON "message_campaign_recipients"("phoneNumber");

-- CreateIndex
CREATE INDEX "message_campaign_recipients_providerMsgId_idx" ON "message_campaign_recipients"("providerMsgId");

-- CreateIndex
CREATE INDEX "message_campaigns_restaurantId_idx" ON "message_campaigns"("restaurantId");

-- CreateIndex
CREATE INDEX "message_campaigns_status_idx" ON "message_campaigns"("status");

-- CreateIndex
CREATE INDEX "message_campaigns_scheduledAt_idx" ON "message_campaigns"("scheduledAt");

-- CreateIndex
CREATE INDEX "message_campaigns_templateId_idx" ON "message_campaigns"("templateId");

-- CreateIndex
CREATE INDEX "message_templates_restaurantId_idx" ON "message_templates"("restaurantId");

-- CreateIndex
CREATE INDEX "message_templates_status_idx" ON "message_templates"("status");

-- CreateIndex
CREATE INDEX "message_templates_category_idx" ON "message_templates"("category");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_restaurantId_name_key" ON "message_templates"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "messaging_provider_configs_restaurantId_idx" ON "messaging_provider_configs"("restaurantId");

-- CreateIndex
CREATE INDEX "messaging_provider_configs_provider_idx" ON "messaging_provider_configs"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_provider_configs_restaurantId_provider_key" ON "messaging_provider_configs"("restaurantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "metric_snapshots_snapshotDate_key" ON "metric_snapshots"("snapshotDate");

-- CreateIndex
CREATE INDEX "metric_snapshots_snapshotDate_idx" ON "metric_snapshots"("snapshotDate");

-- CreateIndex
CREATE INDEX "packaging_qr_scans_restaurantId_idx" ON "packaging_qr_scans"("restaurantId");

-- CreateIndex
CREATE INDEX "packaging_qr_scans_scannedAt_idx" ON "packaging_qr_scans"("scannedAt");

-- CreateIndex
CREATE INDEX "packaging_qr_scans_converted_idx" ON "packaging_qr_scans"("converted");

-- CreateIndex
CREATE INDEX "restaurant_users_restaurantId_idx" ON "restaurant_users"("restaurantId");

-- CreateIndex
CREATE INDEX "restaurant_users_userId_idx" ON "restaurant_users"("userId");

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
CREATE INDEX "staff_commissions_period_idx" ON "staff_commissions"("period");

-- CreateIndex
CREATE INDEX "staff_commissions_status_idx" ON "staff_commissions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_commissions_staffMemberId_period_key" ON "staff_commissions"("staffMemberId", "period");

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
CREATE INDEX "support_messages_ticketId_idx" ON "support_messages"("ticketId");

-- CreateIndex
CREATE INDEX "support_messages_senderId_idx" ON "support_messages"("senderId");

-- CreateIndex
CREATE INDEX "support_messages_ticketId_createdAt_idx" ON "support_messages"("ticketId", "createdAt");

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

