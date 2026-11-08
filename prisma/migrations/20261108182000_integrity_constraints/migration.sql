-- Financial integrity: a wallet can never be negative, amounts are positive.
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_non_negative" CHECK ("balanceCents" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_price_positive" CHECK ("priceCents" > 0 AND "costCents" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amountCents" > 0 AND "refundedCents" >= 0 AND "refundedCents" <= "amountCents");
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_tx_amount_non_zero" CHECK ("amountCents" <> 0 AND "balanceAfterCents" >= 0);
ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_cost_non_negative" CHECK ("costCents" >= 0);
