-- Add performance indexes for critical queries

-- 1. Stock Status Indexes - for filtering on estoque page
CREATE INDEX IF NOT EXISTS "idx_stock_active_quantity" ON "Stock"("active", "quantity") WHERE "active" = true;
CREATE INDEX IF NOT EXISTS "idx_stock_minimum_active" ON "Stock"("minimumStock", "active") WHERE "active" = true;

-- 2. Ingredient Filtering Indexes - for category and status searches
CREATE INDEX IF NOT EXISTS "idx_ingredient_category_active" ON "Ingredient"("categoryId", "active") WHERE "active" = true;
CREATE INDEX IF NOT EXISTS "idx_ingredient_name" ON "Ingredient"("name") WHERE "active" = true;

-- 3. Recipe Ingredient Lookups - avoid N+1 queries
CREATE INDEX IF NOT EXISTS "idx_recipe_ingredient_recipe" ON "RecipeIngredient"("recipeId", "ingredientId");
CREATE INDEX IF NOT EXISTS "idx_recipe_ingredient_ingredient" ON "RecipeIngredient"("ingredientId");

-- 4. Date-Range Indexes - for stock movements (daily consumption analysis)
CREATE INDEX IF NOT EXISTS "idx_stock_movement_ingredient_date" ON "StockMovement"("ingredientId", "createdAt" DESC) WHERE "type" = 'OUT';
CREATE INDEX IF NOT EXISTS "idx_stock_movement_date_range" ON "StockMovement"("createdAt" DESC);

-- 5. Price Trends - for cost analysis
CREATE INDEX IF NOT EXISTS "idx_price_trend_ingredient_date" ON "PriceTrend"("ingredientId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_price_trend_ingredient" ON "PriceTrend"("ingredientId");

-- 6. Composite Indexes for Analytics
CREATE INDEX IF NOT EXISTS "idx_stock_composite" ON "Stock"("active", "ingredientId", "quantity") WHERE "active" = true;

-- 7. Supplier Integration - for sync operations
CREATE INDEX IF NOT EXISTS "idx_supplier_integration_status" ON "SupplierIntegration"("active", "integrationType", "supplierId");

-- 8. Alerts and Forecasts
CREATE INDEX IF NOT EXISTS "idx_alert_dismissed_date" ON "Alert"("dismissed", "createdAt" DESC) WHERE "dismissed" = false;
CREATE INDEX IF NOT EXISTS "idx_stock_forecast_ingredient" ON "StockForecast"("ingredientId");
CREATE INDEX IF NOT EXISTS "idx_stock_forecast_risk" ON "StockForecast"("riskLevel");

-- 9. Production Plans
CREATE INDEX IF NOT EXISTS "idx_production_plan_date" ON "ProductionPlan"("planDate" DESC);
CREATE INDEX IF NOT EXISTS "idx_production_plan_item_plan" ON "ProductionPlanItem"("productionPlanId");
