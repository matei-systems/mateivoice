ALTER TABLE "payouts" ADD COLUMN "settlement_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "fiat_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "fiat_currency" text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "cents_per100_coins" integer;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "processed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "category" text DEFAULT 'transactional' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "body_html" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_settlement_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("settlement_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_processed_by_id_users_id_fk" FOREIGN KEY ("processed_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_queue_idx" ON "email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_category" CHECK ("email_outbox"."category" IN ('transactional', 'security', 'session_updates', 'marketing'));