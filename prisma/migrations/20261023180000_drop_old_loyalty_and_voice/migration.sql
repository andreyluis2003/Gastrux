-- Owner, 2026-10-23: the old loyalty (points, rewards, milestones) and the voice agent have no screen or route any more.
-- Production held only the owner's test restaurants (2 programs, 5 accounts, 3 transactions, 4 rewards, 1 inactive voice config).
-- Children first: dropping a table drops its own foreign keys.

DROP TABLE "loyalty_milestone_redemptions";
DROP TABLE "loyalty_transactions";
DROP TABLE "customer_loyalty_accounts";
DROP TABLE "loyalty_rewards";
DROP TABLE "loyalty_milestones";
DROP TABLE "loyalty_programs";
DROP TABLE "voice_calls";
DROP TABLE "voice_agent_configs";

DROP TYPE "LoyaltyTier";
DROP TYPE "VoiceProvider";
DROP TYPE "VoiceCallStatus";
DROP TYPE "VoiceCallOutcome";
