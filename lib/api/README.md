# API Helpers for Multi-Tenancy

This directory contains utilities for implementing consistent multi-tenancy enforcement across all API routes.

## Files

### `restaurant-context.ts`

Provides utilities for extracting and validating `restaurantId` from the user session.

**Key Functions:**
- `getRestaurantContext()` - Returns `{ userId, restaurantId, role }` from current session
- `validateRestaurantAccess()` - Validates user has access to a restaurant
- `enforceRestaurantIsolation()` - Enforces that request restaurantId matches session restaurantId

**Usage:**
```typescript
const context = await getRestaurantContext();
// Now use context.restaurantId in all queries
```

### `api-response.ts`

Provides consistent error response formatting for all API routes.

**Key Exports:**
- `errorResponse()` - Creates a standardized error response
- `ApiErrors` - Pre-built error response helpers

**Usage:**
```typescript
if (!data) {
  return ApiErrors.NOT_FOUND('Item');
}
```

### `safe-handler.ts`

Wraps API handlers to provide consistent error handling and multi-tenancy enforcement.

**Key Functions:**
- `safeHandler()` - Wraps GET/POST handlers without params
- `safeHandlerWithParams()` - Wraps GET/PUT/DELETE handlers with dynamic params

**Usage:**
```typescript
export const GET = safeHandler(async (req, context) => {
  // context.restaurantId is automatically available
  // All errors are caught and formatted consistently
  const items = await prisma.item.findMany({
    where: { restaurantId: context.restaurantId },
  });
  return NextResponse.json(items);
});
```

## Multi-Tenancy Enforcement

Every API route MUST:

1. **Get restaurant context** - Use `safeHandler` or `getRestaurantContext()`
2. **Filter by restaurantId** - Add `restaurantId: context.restaurantId` to all queries
3. **Validate access** - Use `enforceRestaurantIsolation()` for parameterized routes
4. **Return consistent errors** - Use `ApiErrors` for error responses

## Example: Refactored Route

### Before (with @ts-nocheck)
```typescript
// @ts-nocheck
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // No restaurantId filtering!
  const items = await prisma.item.findMany();
  return NextResponse.json(items);
}
```

### After (typed, safe, multi-tenant)
```typescript
import { safeHandler } from '@/lib/api/safe-handler';

export const GET = safeHandler(async (req, context) => {
  // context.restaurantId is automatically available
  const items = await prisma.item.findMany({
    where: { restaurantId: context.restaurantId },
  });
  return NextResponse.json(items);
});
```

## Removing @ts-nocheck

As routes are refactored to use the helpers, `@ts-nocheck` can be removed. The helpers provide type safety and consistent error handling.
