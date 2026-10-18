import { pgEnum } from "drizzle-orm/pg-core";

// ── Benutzer & Authentifizierung ─────────────────────────────────────────────
export const userRole = pgEnum("user_role", ["customer", "creator", "admin"]);
export const userStatus = pgEnum("user_status", ["active", "suspended", "deleted"]);
export const authTokenPurpose = pgEnum("auth_token_purpose", [
  "email_verification",
  "password_reset",
]);
export const consentDocument = pgEnum("consent_document", [
  "terms",
  "privacy",
  "creator_agreement",
  "community_guidelines",
]);

// ── Creator ─────────────────────────────────────────────────────────────────
export const creatorAvailability = pgEnum("creator_availability", [
  "offline",
  "online",
  "live",
  "in_private",
]);
export const creatorReviewStatus = pgEnum("creator_review_status", [
  "draft",
  "pending_review",
  "approved",
  "changes_requested",
  "suspended",
]);
export const offerKind = pgEnum("offer_kind", ["private_chat"]);
/**
 * Verifizierungsstatus. "test_passed" ist ausschließlich für den Mock-Anbieter
 * und wird NIEMALS als verifiziert angezeigt. "verified" darf nur ein echter
 * Anbieter setzen (per DB-Constraint erzwungen).
 */
export const verificationStatus = pgEnum("verification_status", [
  "not_started",
  "pending",
  "test_passed",
  "verified",
  "rejected",
  "expired",
]);
export const mediaKind = pgEnum("media_kind", ["avatar", "gallery"]);
export const mediaVisibility = pgEnum("media_visibility", ["public", "private"]);
export const moderationStatus = pgEnum("moderation_status", ["pending", "approved", "rejected"]);

// ── Münzen & Buchhaltung ────────────────────────────────────────────────────
/**
 * TEST_COIN: simulierte Nutzungseinheiten ohne Geldwert (Prototyp).
 * COIN: für einen späteren, rechtlich geprüften Echtbetrieb reserviert.
 */
export const coinCurrency = pgEnum("coin_currency", ["TEST_COIN", "COIN"]);
export const ledgerAccountKind = pgEnum("ledger_account_kind", [
  "customer_wallet",
  "creator_earnings",
  "platform_revenue",
  "system_test_issuance",
  "system_payment_clearing",
  "system_payout_clearing",
]);
export const ledgerTransactionKind = pgEnum("ledger_transaction_kind", [
  "test_credit",
  "purchase",
  "session_charge",
  "refund",
  "chargeback",
  "payout",
  "adjustment",
]);
export const paymentOrderStatus = pgEnum("payment_order_status", [
  "created",
  "pending",
  "confirmed",
  "failed",
  "refunded",
  "charged_back",
]);
export const payoutStatus = pgEnum("payout_status", [
  "requested",
  "pending",
  "completed",
  "failed",
  "cancelled",
]);

// ── Video ───────────────────────────────────────────────────────────────────
export const videoSessionKind = pgEnum("video_session_kind", ["public_stream", "private_chat"]);
export const videoSessionStatus = pgEnum("video_session_status", [
  "requested",
  "accepted",
  "active",
  "ended",
  "declined",
  "cancelled",
  "expired",
  "failed",
]);
export const videoSessionEndReason = pgEnum("video_session_end_reason", [
  "customer_left",
  "creator_left",
  "insufficient_funds",
  "connection_lost",
  "moderation",
  "provider_error",
  "stream_ended",
]);
export const participantRole = pgEnum("participant_role", ["customer", "creator", "viewer"]);
export const sessionEventSource = pgEnum("session_event_source", ["server", "provider", "client"]);

// ── Moderation & Support ────────────────────────────────────────────────────
export const reportTargetType = pgEnum("report_target_type", [
  "creator_profile",
  "user",
  "video_session",
  "media",
]);
export const reportCategory = pgEnum("report_category", [
  "minor_suspected",
  "non_consensual",
  "illegal_content",
  "violence_or_threat",
  "harassment",
  "fraud_or_scam",
  "impersonation",
  "spam",
  "other",
]);
export const reportPriority = pgEnum("report_priority", ["normal", "high", "critical"]);
export const reportStatus = pgEnum("report_status", [
  "open",
  "in_review",
  "action_taken",
  "no_action",
  "dismissed",
]);
export const sanctionKind = pgEnum("sanction_kind", ["warning", "suspension", "profile_hidden"]);
export const appealStatus = pgEnum("appeal_status", ["open", "upheld", "overturned"]);
export const supportCategory = pgEnum("support_category", [
  "account",
  "payments",
  "technical",
  "safety",
  "creator",
  "privacy",
  "other",
]);
export const supportStatus = pgEnum("support_status", ["open", "waiting_for_user", "closed"]);

// ── Benachrichtigungen ──────────────────────────────────────────────────────
export const emailOutboxStatus = pgEnum("email_outbox_status", [
  "stored_dev",
  "queued",
  "sent",
  "failed",
  "suppressed",
]);
