CREATE TYPE "public"."appeal_status" AS ENUM('open', 'upheld', 'overturned');--> statement-breakpoint
CREATE TYPE "public"."auth_token_purpose" AS ENUM('email_verification', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."coin_currency" AS ENUM('TEST_COIN', 'COIN');--> statement-breakpoint
CREATE TYPE "public"."consent_document" AS ENUM('terms', 'privacy', 'creator_agreement', 'community_guidelines');--> statement-breakpoint
CREATE TYPE "public"."creator_availability" AS ENUM('offline', 'online', 'live', 'in_private');--> statement-breakpoint
CREATE TYPE "public"."creator_review_status" AS ENUM('draft', 'pending_review', 'approved', 'changes_requested', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."email_outbox_status" AS ENUM('stored_dev', 'queued', 'sent', 'failed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_kind" AS ENUM('customer_wallet', 'creator_earnings', 'platform_revenue', 'system_test_issuance', 'system_payment_clearing', 'system_payout_clearing');--> statement-breakpoint
CREATE TYPE "public"."ledger_transaction_kind" AS ENUM('test_credit', 'purchase', 'session_charge', 'refund', 'chargeback', 'payout', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('avatar', 'gallery');--> statement-breakpoint
CREATE TYPE "public"."media_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."offer_kind" AS ENUM('private_chat');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('customer', 'creator', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."payment_order_status" AS ENUM('created', 'pending', 'confirmed', 'failed', 'refunded', 'charged_back');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('requested', 'pending', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."report_category" AS ENUM('minor_suspected', 'non_consensual', 'illegal_content', 'violence_or_threat', 'harassment', 'fraud_or_scam', 'impersonation', 'spam', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_priority" AS ENUM('normal', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'in_review', 'action_taken', 'no_action', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."report_target_type" AS ENUM('creator_profile', 'user', 'video_session', 'media');--> statement-breakpoint
CREATE TYPE "public"."sanction_kind" AS ENUM('warning', 'suspension', 'profile_hidden');--> statement-breakpoint
CREATE TYPE "public"."session_event_source" AS ENUM('server', 'provider', 'client');--> statement-breakpoint
CREATE TYPE "public"."support_category" AS ENUM('account', 'payments', 'technical', 'safety', 'creator', 'privacy', 'other');--> statement-breakpoint
CREATE TYPE "public"."support_status" AS ENUM('open', 'waiting_for_user', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'creator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('not_started', 'pending', 'test_passed', 'verified', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."video_session_end_reason" AS ENUM('customer_left', 'creator_left', 'insufficient_funds', 'connection_lost', 'moderation', 'provider_error', 'stream_ended');--> statement-breakpoint
CREATE TYPE "public"."video_session_kind" AS ENUM('public_stream', 'private_chat');--> statement-breakpoint
CREATE TYPE "public"."video_session_status" AS ENUM('requested', 'accepted', 'active', 'ended', 'declined', 'cancelled', 'expired', 'failed');--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mfa_verified_at" timestamp with time zone,
	"user_agent" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "auth_token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email_account" boolean DEFAULT true NOT NULL,
	"email_session_updates" boolean DEFAULT false NOT NULL,
	"email_marketing" boolean DEFAULT false NOT NULL,
	"in_app_session_updates" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document" "consent_document" NOT NULL,
	"document_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	CONSTRAINT "user_consents_unique" UNIQUE("user_id","document","document_version")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"username" text NOT NULL,
	"adult_self_declared_at" timestamp with time zone NOT NULL,
	"totp_secret_encrypted" text,
	"totp_enabled_at" timestamp with time zone,
	"totp_last_used_step" bigint,
	"is_test_account" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_username_format" CHECK ("users"."username" ~ '^[A-Za-z0-9_.-]{3,24}$'),
	CONSTRAINT "users_deleted_consistency" CHECK (("users"."status" = 'deleted') = ("users"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "creator_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"kind" "offer_kind" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"coins_per_minute" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_offers_profile_kind_unique" UNIQUE("creator_profile_id","kind"),
	CONSTRAINT "creator_offers_price_range" CHECK ("creator_offers"."coins_per_minute" BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"contact_rules" text DEFAULT '' NOT NULL,
	"availability" "creator_availability" DEFAULT 'offline' NOT NULL,
	"review_status" "creator_review_status" DEFAULT 'draft' NOT NULL,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_id" uuid,
	"avatar_media_id" uuid,
	"allow_search_indexing" boolean DEFAULT false NOT NULL,
	"is_test_profile" boolean DEFAULT false NOT NULL,
	"last_online_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_profiles_slug_format" CHECK ("creator_profiles"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "creator_profiles_display_name_length" CHECK (char_length("creator_profiles"."display_name") BETWEEN 2 AND 40),
	CONSTRAINT "creator_profiles_tagline_length" CHECK (char_length("creator_profiles"."tagline") <= 120),
	CONSTRAINT "creator_profiles_bio_length" CHECK (char_length("creator_profiles"."bio") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "creator_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_reference" text NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_verifications_provider_ref_unique" UNIQUE("provider","provider_reference"),
	CONSTRAINT "creator_verifications_no_mock_verified" CHECK ("creator_verifications"."status" <> 'verified' OR "creator_verifications"."provider" <> 'mock'),
	CONSTRAINT "creator_verifications_test_passed_mock_only" CHECK ("creator_verifications"."status" <> 'test_passed' OR "creator_verifications"."provider" = 'mock'),
	CONSTRAINT "creator_verifications_verified_at" CHECK ("creator_verifications"."status" <> 'verified' OR "creator_verifications"."verified_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"kind" "media_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"visibility" "media_visibility" DEFAULT 'public' NOT NULL,
	"moderation_status" "moderation_status" DEFAULT 'pending' NOT NULL,
	"moderation_note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "media_assets_size_positive" CHECK ("media_assets"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "coin_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"coins" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_example" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coin_packages_positive" CHECK ("coin_packages"."coins" > 0 AND "coin_packages"."price_cents" > 0),
	CONSTRAINT "coin_packages_currency" CHECK ("coin_packages"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "ledger_account_kind" NOT NULL,
	"owner_user_id" uuid,
	"currency" "coin_currency" NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"allow_negative" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_kind_owner_currency_unique" UNIQUE NULLS NOT DISTINCT("kind","owner_user_id","currency"),
	CONSTRAINT "ledger_accounts_non_negative" CHECK ("ledger_accounts"."allow_negative" OR "ledger_accounts"."balance" >= 0),
	CONSTRAINT "ledger_accounts_owner_required" CHECK (("ledger_accounts"."kind" IN ('customer_wallet', 'creator_earnings')) = ("ledger_accounts"."owner_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_non_zero" CHECK ("ledger_entries"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" "ledger_transaction_kind" NOT NULL,
	"currency" "coin_currency" NOT NULL,
	"simulated" boolean NOT NULL,
	"description" text NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"actor_user_id" uuid,
	"reversal_of_id" uuid,
	"commission_bps" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_test_coin_simulated" CHECK ("ledger_transactions"."currency" <> 'TEST_COIN' OR "ledger_transactions"."simulated"),
	CONSTRAINT "ledger_transactions_commission_range" CHECK ("ledger_transactions"."commission_bps" IS NULL OR "ledger_transactions"."commission_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"order_id" uuid,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "payment_events_provider_event_unique" UNIQUE("provider","provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"coins" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"provider" text NOT NULL,
	"provider_reference" text,
	"status" "payment_order_status" DEFAULT 'created' NOT NULL,
	"idempotency_key" text NOT NULL,
	"ledger_transaction_id" uuid,
	"simulated" boolean NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"currency" "coin_currency" NOT NULL,
	"status" "payout_status" DEFAULT 'requested' NOT NULL,
	"provider" text NOT NULL,
	"provider_reference" text,
	"failure_reason" text,
	"ledger_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_amount_positive" CHECK ("payouts"."amount" > 0),
	CONSTRAINT "payouts_no_test_coins" CHECK ("payouts"."currency" = 'COIN')
);
--> statement-breakpoint
CREATE TABLE "video_session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source" "session_event_source" NOT NULL,
	"actor_user_id" uuid,
	"provider_event_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_session_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "participant_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_session_participants_unique" UNIQUE("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "video_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "video_session_kind" NOT NULL,
	"creator_profile_id" uuid NOT NULL,
	"creator_user_id" uuid NOT NULL,
	"customer_user_id" uuid,
	"status" "video_session_status" NOT NULL,
	"coins_per_minute" integer,
	"commission_bps" integer,
	"currency" "coin_currency" DEFAULT 'TEST_COIN' NOT NULL,
	"provider" text NOT NULL,
	"provider_room_id" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" "video_session_end_reason",
	"charged_minutes" integer DEFAULT 0 NOT NULL,
	"total_coins" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_sessions_private_fields" CHECK ("video_sessions"."kind" <> 'private_chat' OR ("video_sessions"."customer_user_id" IS NOT NULL AND "video_sessions"."coins_per_minute" IS NOT NULL AND "video_sessions"."commission_bps" IS NOT NULL)),
	CONSTRAINT "video_sessions_public_no_customer" CHECK ("video_sessions"."kind" <> 'public_stream' OR "video_sessions"."customer_user_id" IS NULL),
	CONSTRAINT "video_sessions_not_self" CHECK ("video_sessions"."customer_user_id" IS NULL OR "video_sessions"."customer_user_id" <> "video_sessions"."creator_user_id")
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sanction_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"status" "appeal_status" DEFAULT 'open' NOT NULL,
	"decided_by_id" uuid,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appeals_message_length" CHECK (char_length("appeals"."message") BETWEEN 20 AND 4000)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid,
	"target_type" "report_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"category" "report_category" NOT NULL,
	"description" text NOT NULL,
	"priority" "report_priority" NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"assigned_admin_id" uuid,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_description_length" CHECK (char_length("reports"."description") BETWEEN 10 AND 4000)
);
--> statement-breakpoint
CREATE TABLE "sanctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "sanction_kind" NOT NULL,
	"reason" text NOT NULL,
	"report_id" uuid,
	"created_by_id" uuid NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"lifted_at" timestamp with time zone,
	"lifted_by_id" uuid,
	"lift_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sanctions_reason_length" CHECK (char_length("sanctions"."reason") >= 10),
	CONSTRAINT "sanctions_period" CHECK ("sanctions"."ends_at" IS NULL OR "sanctions"."ends_at" > "sanctions"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" uuid,
	"is_staff" boolean DEFAULT false NOT NULL,
	"is_internal_note" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_messages_body_length" CHECK (char_length("support_messages"."body") BETWEEN 1 AND 5000)
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"contact_email" text,
	"category" "support_category" NOT NULL,
	"subject" text NOT NULL,
	"status" "support_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_contact" CHECK ("support_tickets"."user_id" IS NOT NULL OR "support_tickets"."contact_email" IS NOT NULL),
	CONSTRAINT "support_tickets_subject_length" CHECK (char_length("support_tickets"."subject") BETWEEN 3 AND 150)
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_address" text NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text,
	"status" "email_outbox_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link_path" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_offers" ADD CONSTRAINT "creator_offers_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_avatar_media_id_media_assets_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_verifications" ADD CONSTRAINT "creator_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_reversal_of_id_ledger_transactions_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_payment_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."payment_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_package_id_coin_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."coin_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_session_events" ADD CONSTRAINT "video_session_events_session_id_video_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."video_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_session_events" ADD CONSTRAINT "video_session_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_session_participants" ADD CONSTRAINT "video_session_participants_session_id_video_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."video_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_session_participants" ADD CONSTRAINT "video_session_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_sessions" ADD CONSTRAINT "video_sessions_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_sessions" ADD CONSTRAINT "video_sessions_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_sessions" ADD CONSTRAINT "video_sessions_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_sanction_id_sanctions_id_fk" FOREIGN KEY ("sanction_id") REFERENCES "public"."sanctions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_assigned_admin_id_users_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_lifted_by_id_users_id_fk" FOREIGN KEY ("lifted_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_hash_unique" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_purpose_idx" ON "auth_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_unique" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_profiles_user_unique" ON "creator_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_profiles_slug_unique" ON "creator_profiles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "creator_profiles_review_idx" ON "creator_profiles" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "creator_profiles_availability_idx" ON "creator_profiles" USING btree ("availability");--> statement-breakpoint
CREATE INDEX "creator_verifications_user_idx" ON "creator_verifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_key_unique" ON "media_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "media_assets_owner_idx" ON "media_assets" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coin_packages_code_unique" ON "coin_packages" USING btree ("code");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_idempotency_unique" ON "ledger_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_reversal_unique" ON "ledger_transactions" USING btree ("reversal_of_id") WHERE "ledger_transactions"."reversal_of_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ledger_transactions_reference_idx" ON "ledger_transactions" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_created_idx" ON "ledger_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_idempotency_unique" ON "payment_orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_provider_ref_unique" ON "payment_orders" USING btree ("provider","provider_reference") WHERE "payment_orders"."provider_reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_orders_user_idx" ON "payment_orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payouts_creator_idx" ON "payouts" USING btree ("creator_user_id","created_at");--> statement-breakpoint
CREATE INDEX "video_session_events_session_idx" ON "video_session_events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "video_session_events_provider_event_unique" ON "video_session_events" USING btree ("provider_event_id") WHERE "video_session_events"."provider_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "video_sessions_creator_idx" ON "video_sessions" USING btree ("creator_user_id","created_at");--> statement-breakpoint
CREATE INDEX "video_sessions_customer_idx" ON "video_sessions" USING btree ("customer_user_id","created_at");--> statement-breakpoint
CREATE INDEX "video_sessions_status_idx" ON "video_sessions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "video_sessions_one_open_per_customer" ON "video_sessions" USING btree ("customer_user_id") WHERE "video_sessions"."kind" = 'private_chat' AND "video_sessions"."status" IN ('requested', 'accepted', 'active');--> statement-breakpoint
CREATE UNIQUE INDEX "video_sessions_one_private_per_creator" ON "video_sessions" USING btree ("creator_user_id") WHERE "video_sessions"."kind" = 'private_chat' AND "video_sessions"."status" IN ('accepted', 'active');--> statement-breakpoint
CREATE UNIQUE INDEX "video_sessions_one_stream_per_creator" ON "video_sessions" USING btree ("creator_user_id") WHERE "video_sessions"."kind" = 'public_stream' AND "video_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_idx" ON "admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_target_idx" ON "admin_audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appeals_one_per_sanction" ON "appeals" USING btree ("sanction_id");--> statement-breakpoint
CREATE INDEX "reports_queue_idx" ON "reports" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "sanctions_user_idx" ON "sanctions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_messages_ticket_idx" ON "support_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_user_idx" ON "support_tickets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_created_idx" ON "email_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_idx" ON "rate_limit_buckets" USING btree ("expires_at");