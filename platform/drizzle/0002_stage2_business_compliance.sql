CREATE TYPE "public"."chat_message_kind" AS ENUM('message', 'tip', 'system');--> statement-breakpoint
CREATE TYPE "public"."creator_declaration_kind" AS ENUM('adult_and_identity', 'sole_performer', 'content_rights', 'consent_and_no_coercion', 'no_recording_distribution', 'rules_acknowledged');--> statement-breakpoint
CREATE TYPE "public"."legal_hold_target" AS ENUM('user', 'media', 'video_session', 'chat_message', 'report');--> statement-breakpoint
CREATE TYPE "public"."moderation_action_kind" AS ENUM('content_removed', 'profile_hidden', 'account_suspended', 'warning', 'message_deleted', 'user_muted', 'stream_terminated', 'restriction_lifted');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_kind" AS ENUM('export', 'deletion', 'rectification', 'objection');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_status" AS ENUM('received', 'completed', 'rejected', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."risk_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('open', 'reviewed', 'dismissed');--> statement-breakpoint
ALTER TYPE "public"."auth_token_purpose" ADD VALUE 'staff_invite';--> statement-breakpoint
ALTER TYPE "public"."ledger_account_kind" ADD VALUE 'system_payout_settled';--> statement-breakpoint
ALTER TYPE "public"."ledger_transaction_kind" ADD VALUE 'tip';--> statement-breakpoint
ALTER TYPE "public"."ledger_transaction_kind" ADD VALUE 'payout_settlement';--> statement-breakpoint
ALTER TYPE "public"."payout_status" ADD VALUE 'approved';--> statement-breakpoint
ALTER TYPE "public"."payout_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."payout_status" ADD VALUE 'processing';--> statement-breakpoint
ALTER TYPE "public"."report_target_type" ADD VALUE 'chat_message';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'moderator';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'support';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'finance';--> statement-breakpoint
CREATE TABLE "creator_payout_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"method" text DEFAULT 'sepa' NOT NULL,
	"account_holder" text NOT NULL,
	"iban_encrypted" text NOT NULL,
	"iban_last4" text NOT NULL,
	"country" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_payout_profiles_method" CHECK ("creator_payout_profiles"."method" IN ('sepa')),
	CONSTRAINT "creator_payout_profiles_country" CHECK ("creator_payout_profiles"."country" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_format" CHECK ("categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "categories_label_length" CHECK (char_length("categories"."label") BETWEEN 2 AND 40)
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platform_settings_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"previous_value" jsonb,
	"changed_by_id" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"sender_user_id" uuid,
	"kind" "chat_message_kind" DEFAULT 'message' NOT NULL,
	"body" text NOT NULL,
	"tip_amount" integer,
	"deleted_at" timestamp with time zone,
	"deleted_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_body_length" CHECK (char_length("chat_messages"."body") BETWEEN 1 AND 1000),
	CONSTRAINT "chat_messages_tip" CHECK (("chat_messages"."kind" = 'tip') = ("chat_messages"."tip_amount" IS NOT NULL AND "chat_messages"."tip_amount" > 0))
);
--> statement-breakpoint
CREATE TABLE "chat_mutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_user_id" uuid,
	"user_id" uuid NOT NULL,
	"until" timestamp with time zone,
	"reason" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_creator_profile_id_pk" PRIMARY KEY("user_id","creator_profile_id")
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_user_id_blocked_user_id_pk" PRIMARY KEY("blocker_user_id","blocked_user_id"),
	CONSTRAINT "user_blocks_not_self" CHECK ("user_blocks"."blocker_user_id" <> "user_blocks"."blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "age_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_reference" text NOT NULL,
	"method" text,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "age_verifications_provider_ref_unique" UNIQUE("provider","provider_reference"),
	CONSTRAINT "age_verifications_no_mock_verified" CHECK ("age_verifications"."status" <> 'verified' OR "age_verifications"."provider" <> 'mock'),
	CONSTRAINT "age_verifications_test_passed_mock_only" CHECK ("age_verifications"."status" <> 'test_passed' OR "age_verifications"."provider" = 'mock'),
	CONSTRAINT "age_verifications_verified_at" CHECK ("age_verifications"."status" <> 'verified' OR "age_verifications"."verified_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "creator_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"declaration" "creator_declaration_kind" NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	CONSTRAINT "creator_declarations_unique" UNIQUE("user_id","declaration","version")
);
--> statement-breakpoint
CREATE TABLE "legal_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "legal_hold_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"report_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"released_by_id" uuid,
	"release_reason" text,
	CONSTRAINT "legal_holds_reason_length" CHECK (char_length("legal_holds"."reason") >= 10)
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" "moderation_action_kind" NOT NULL,
	"affected_user_id" uuid,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"statement" text NOT NULL,
	"rule_reference" text,
	"report_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_actions_statement_length" CHECK (char_length("moderation_actions"."statement") >= 10)
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" "privacy_request_kind" NOT NULL,
	"status" "privacy_request_status" DEFAULT 'received' NOT NULL,
	"note" text,
	"handled_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "risk_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"severity" "risk_severity" NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "risk_status" DEFAULT 'open' NOT NULL,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_no_test_coins";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "simulated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "destination_masked" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "reviewed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "creator_payout_profiles" ADD CONSTRAINT "creator_payout_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings_history" ADD CONSTRAINT "platform_settings_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_video_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."video_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_mutes" ADD CONSTRAINT "chat_mutes_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_mutes" ADD CONSTRAINT "chat_mutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_mutes" ADD CONSTRAINT "chat_mutes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "age_verifications" ADD CONSTRAINT "age_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_declarations" ADD CONSTRAINT "creator_declarations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_released_by_id_users_id_fk" FOREIGN KEY ("released_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_affected_user_id_users_id_fk" FOREIGN KEY ("affected_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_handled_by_id_users_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_unique" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "platform_settings_history_key_idx" ON "platform_settings_history" USING btree ("key","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_session_idx" ON "chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_sender_idx" ON "chat_messages" USING btree ("sender_user_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_mutes_user_idx" ON "chat_mutes" USING btree ("user_id","creator_user_id");--> statement-breakpoint
CREATE INDEX "favorites_profile_idx" ON "favorites" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_user_id");--> statement-breakpoint
CREATE INDEX "age_verifications_user_idx" ON "age_verifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "legal_holds_target_idx" ON "legal_holds" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "moderation_actions_user_idx" ON "moderation_actions" USING btree ("affected_user_id","created_at");--> statement-breakpoint
CREATE INDEX "privacy_requests_status_idx" ON "privacy_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "risk_events_status_idx" ON "risk_events" USING btree ("status","severity","created_at");--> statement-breakpoint
CREATE INDEX "risk_events_user_idx" ON "risk_events" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_idempotency_unique" ON "payouts" USING btree ("idempotency_key") WHERE "payouts"."idempotency_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_country_format" CHECK ("users"."country" IS NULL OR "users"."country" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_currency_mode" CHECK (("payouts"."currency" = 'COIN' AND NOT "payouts"."simulated") OR ("payouts"."currency" = 'TEST_COIN' AND "payouts"."simulated" AND "payouts"."provider" = 'sandbox'));