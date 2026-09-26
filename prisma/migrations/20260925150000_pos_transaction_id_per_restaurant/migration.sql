-- A POS transaction id is unique per restaurant and machine (provider), not across all restaurants:
-- senders that number sales from 1 used to collide, and the Stone/SumUp upserts could overwrite
-- another restaurant's sale. Idempotent, like the other migrations of this branch.
DROP INDEX IF EXISTS "pos_transactions_transactionId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "pos_transactions_restaurantId_provider_transactionId_key"
  ON "pos_transactions"("restaurantId", "provider", "transactionId");
