// @ts-nocheck
import { shouldRefresh, isExpiredOrNear, isExpired } from '../../lib/mercadopago-connect/refresh-policy';

const DAY = 24 * 60 * 60 * 1000;
const LIFETIME_SECONDS = 180 * 24 * 60 * 60; // 180 days; 25% = 45 days

describe('mercadopago-connect/refresh-policy', () => {
  const now = Date.now();

  describe('shouldRefresh', () => {
    it('is false while more than 25% of the lifetime remains', () => {
      expect(shouldRefresh({ expiresAt: new Date(now + 150 * DAY), lifetimeSeconds: LIFETIME_SECONDS }, now)).toBe(false);
      expect(shouldRefresh({ expiresAt: new Date(now + 46 * DAY), lifetimeSeconds: LIFETIME_SECONDS }, now)).toBe(false);
    });

    it('is true once less than 25% of the lifetime remains', () => {
      expect(shouldRefresh({ expiresAt: new Date(now + 44 * DAY), lifetimeSeconds: LIFETIME_SECONDS }, now)).toBe(true);
      expect(shouldRefresh({ expiresAt: new Date(now + 1 * DAY), lifetimeSeconds: LIFETIME_SECONDS }, now)).toBe(true);
    });

    it('is true for an already expired token', () => {
      expect(shouldRefresh({ expiresAt: new Date(now - DAY), lifetimeSeconds: LIFETIME_SECONDS }, now)).toBe(true);
    });
  });

  describe('isExpiredOrNear', () => {
    it('is true within 24 hours of expiry and after it', () => {
      expect(isExpiredOrNear({ expiresAt: new Date(now + 23 * 60 * 60 * 1000) }, now)).toBe(true);
      expect(isExpiredOrNear({ expiresAt: new Date(now - 1000) }, now)).toBe(true);
    });

    it('is false with more than 24 hours left', () => {
      expect(isExpiredOrNear({ expiresAt: new Date(now + 2 * DAY) }, now)).toBe(false);
    });
  });

  describe('isExpired', () => {
    it('is true only when expiry is not in the future', () => {
      expect(isExpired({ expiresAt: new Date(now - 1) }, now)).toBe(true);
      expect(isExpired({ expiresAt: new Date(now) }, now)).toBe(true);
      expect(isExpired({ expiresAt: new Date(now + 1) }, now)).toBe(false);
    });
  });
});
