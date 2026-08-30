/**
 * Assertion helpers for multi-tenancy tests
 */

/**
 * Assert that all items in array belong to the same restaurant
 */
export function assertRestaurantOwnership(
  items: any[],
  restaurantId: string,
  fieldName = 'restaurantId'
) {
  items.forEach((item, index) => {
    if (item[fieldName] !== restaurantId) {
      throw new Error(
        `Item at index ${index} has restaurantId '${item[fieldName]}', expected '${restaurantId}'`
      );
    }
  });
}

/**
 * Assert that no items from a different restaurant are present
 */
export function assertNoOtherRestaurantData(
  items: any[],
  restaurantId: string,
  fieldName = 'restaurantId'
) {
  const otherRestaurantItems = items.filter(item => item[fieldName] !== restaurantId);
  if (otherRestaurantItems.length > 0) {
    throw new Error(
      `Found ${otherRestaurantItems.length} items from other restaurants in response`
    );
  }
}

/**
 * Assert that two datasets are completely isolated
 */
export function assertDataIsolation(
  data1: any[],
  data2: any[],
  identifierField = 'id'
) {
  const ids1 = new Set(data1.map(item => item[identifierField]));
  const ids2 = new Set(data2.map(item => item[identifierField]));

  const intersection = Array.from(ids1).filter(id => ids2.has(id));
  if (intersection.length > 0) {
    throw new Error(
      `Found ${intersection.length} overlapping items between datasets. Data isolation violated!`
    );
  }
}

/**
 * Assert that response contains required headers
 */
export function assertSecurityHeaders(headers: Record<string, string>) {
  const requiredHeaders = [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'X-XSS-Protection',
  ];

  const lowerHeaders = Object.keys(headers).map(h => h.toLowerCase());
  requiredHeaders.forEach(header => {
    if (!lowerHeaders.includes(header.toLowerCase())) {
      throw new Error(`Missing required security header: ${header}`);
    }
  });
}

/**
 * Assert that API response status is expected
 */
export function assertStatus(actual: number, expected: number | number[], message?: string) {
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  if (!expectedStatuses.includes(actual)) {
    throw new Error(
      message || `Expected status ${expected}, got ${actual}`
    );
  }
}
