-- Nachweis-Tabellen sind unveränderlich (append-only): Einstellungs-Historie,
-- Creator-Erklärungen und Moderationsmaßnahmen (Begründungen).
CREATE TRIGGER platform_settings_history_append_only
  BEFORE UPDATE OR DELETE ON platform_settings_history
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER creator_declarations_append_only
  BEFORE UPDATE OR DELETE ON creator_declarations
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER moderation_actions_append_only
  BEFORE UPDATE OR DELETE ON moderation_actions
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
