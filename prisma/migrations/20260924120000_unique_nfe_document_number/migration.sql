-- A fiscal note number is used once per emitter config, model (NFCe/NFe) and series.
-- Numbers used to be read and incremented without a lock, so two notes could share one.
-- Before deploying, check that no duplicate exists (this migration fails if one does):
--   SELECT "configId", "documentType", "documentSeries", "documentNumber", COUNT(*)
--   FROM "nfe_documents"
--   GROUP BY 1, 2, 3, 4 HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX "nfe_documents_number_key" ON "nfe_documents"("configId", "documentType", "documentSeries", "documentNumber");
