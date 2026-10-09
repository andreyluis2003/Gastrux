'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { UpgradeModal } from '@/components/upgrade-modal';

/** The restaurant sales of the month (app/api/transaction-limit-status) */
interface TransactionLimitStatus {
  currentTier: string;
  limit: number;
  currentCount: number;
  remaining: number;
}

export function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const [limitStatus, setLimitStatus] = useState<TransactionLimitStatus | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const upgradeShown = useRef(false);

  useEffect(() => {
    if (!session?.user?.id) return;

    async function fetchLimitStatus() {
      try {
        const response = await fetch('/api/transaction-limit-status');
        if (response.ok) {
          const data = await response.json();
          setLimitStatus(data);

          // Show modal if user is at or near limit (Starter tier)
          // Once, when the Starter month reaches its limit (it used to reopen every minute)
          if (data.currentTier === 'starter' && data.limit < 999999 && data.remaining <= 0 && !upgradeShown.current) {
            upgradeShown.current = true;
            setShowUpgradeModal(true);
          }
        }
      } catch (error) {
        console.error('Failed to fetch transaction limit status:', error);
      }
    }

    fetchLimitStatus();
    // Refresh every 60 seconds to check if limit is reached
    const interval = setInterval(fetchLimitStatus, 60000);
    return () => clearInterval(interval);
  }, [session?.user?.id]);

  return (
    <>
      {children}
      {limitStatus && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          currentTier={limitStatus.currentTier}
          remaining={limitStatus.remaining}
          limit={limitStatus.limit}
        />
      )}
    </>
  );
}
