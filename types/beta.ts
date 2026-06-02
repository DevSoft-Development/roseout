export type BetaTesterType = "user" | "location_owner" | "ambassador" | "experience_team" | "admin" | "superadmin";
export type BetaApplicationStatus = "new" | "approved" | "rejected" | "waitlist" | "invited" | "converted";
export type BetaTesterStatus = "active" | "paused" | "completed" | "removed";
export type BetaInviteStatus = "pending" | "accepted" | "expired" | "revoked";
export type BetaTaskStatus = "draft" | "active" | "paused" | "completed" | "archived";
export type BetaTaskAssignmentStatus = "assigned" | "in_progress" | "completed" | "skipped";
export type BetaFeedbackType = "bug" | "confusing" | "bad_search_results" | "search_was_slow" | "missing_photo" | "wrong_category" | "reservation_issue" | "claim_issue" | "qr_issue" | "design_feedback" | "feature_request" | "general";
export type BetaFeatureArea = "search_quality" | "search_speed" | "natural_search" | "create_flow" | "location_page" | "missing_photos" | "reservations" | "claims" | "qr_codes" | "owner_dashboard" | "crm" | "imports" | "email" | "mobile" | "admin_dashboard" | "general";
export type BetaFeedbackStatus = "new" | "reviewing" | "planned" | "fixed" | "rejected" | "needs_more_info" | "archived";
export type BetaBugSeverity = "low" | "medium" | "high" | "critical";
export type BetaBugStatus = "new" | "confirmed" | "in_progress" | "fixed" | "wont_fix" | "duplicate" | "archived";
export type SearchSpeedStatus = "fast" | "good" | "slow" | "critical" | "failed" | "timeout";
export type BetaReminderType = "weekly_tasks" | "midweek_reminder" | "daily_incomplete_reminder" | "friday_final_reminder" | "completed_weekly_goal";
export type BetaReminderStatus = "pending" | "sent" | "failed" | "skipped";
export type BetaPromptMode = "predefined" | "custom" | "either";

export type TurnstileVerifyResult = {
  success: boolean;
  action?: string;
  hostname?: string;
  challengeTs?: string;
  errorCodes?: string[];
  bypassed?: boolean;
  bypassReason?: string;
};

export type BetaApplication = {
  id: string; name: string; email: string; phone?: string | null; city?: string | null; borough?: string | null;
  tester_type: BetaTesterType; status: BetaApplicationStatus; device_type?: string | null; testing_interests?: string[] | null;
  availability?: string | null; notes?: string | null; turnstile_verified?: boolean | null; turnstile_action?: string | null;
  turnstile_hostname?: string | null; reviewed_by?: string | null; reviewed_at?: string | null; created_at: string; updated_at: string;
};
export type BetaTester = { id: string; user_id?: string | null; application_id?: string | null; name?: string | null; email: string; phone?: string | null; tester_type: BetaTesterType; status: BetaTesterStatus; invite_code?: string | null; notes?: string | null; approved_by?: string | null; approved_at?: string | null; last_active_at?: string | null; weekly_required_tests: number; weekly_completed_tests: number; current_week_start?: string | null; testing_cadence?: string | null; created_at: string; updated_at: string; };
export type BetaInvite = { id: string; email: string; invite_code: string; tester_type: BetaTesterType; status: BetaInviteStatus; invited_by?: string | null; accepted_by?: string | null; expires_at?: string | null; accepted_at?: string | null; created_at: string; updated_at: string; };
export type BetaTask = { id: string; title: string; description?: string | null; tester_type: BetaTesterType; feature_area: BetaFeatureArea; priority: "low" | "medium" | "high" | "critical"; status: BetaTaskStatus; due_at?: string | null; test_url?: string | null; button_label?: string | null; estimated_minutes?: number | null; instructions?: string | null; reminder_enabled?: boolean | null; prompt_mode?: BetaPromptMode | null; predefined_prompt?: string | null; allow_custom_prompt?: boolean | null; custom_prompt_required?: boolean | null; created_by?: string | null; created_at: string; updated_at: string; };
export type BetaTaskAssignment = { id: string; task_id: string; tester_id: string; status: BetaTaskAssignmentStatus; tester_notes?: string | null; assigned_week_start?: string | null; counts_toward_weekly_goal?: boolean | null; test_url?: string | null; assigned_prompt?: string | null; submitted_prompt?: string | null; prompt_mode?: BetaPromptMode | null; used_custom_prompt?: boolean | null; reminder_sent_at?: string | null; last_reminder_sent_at?: string | null; reminder_count?: number | null; started_at?: string | null; viewed_at?: string | null; completed_at?: string | null; created_at: string; updated_at: string; beta_tasks?: BetaTask | null; };
export type BetaFeedback = { id: string; tester_id?: string | null; user_id?: string | null; feedback_type: BetaFeedbackType; feature_area: BetaFeatureArea; page_url?: string | null; location_id?: string | null; reservation_id?: string | null; search_query?: string | null; search_log_id?: string | null; submitted_prompt?: string | null; expected_result?: string | null; actual_result?: string | null; result_accuracy_rating?: number | null; speed_rating?: "fast" | "okay" | "slow" | "very_slow" | "failed" | null; rating?: number | null; message: string; screenshot_url?: string | null; browser?: string | null; device?: string | null; turnstile_verified?: boolean | null; turnstile_action?: string | null; turnstile_hostname?: string | null; status: BetaFeedbackStatus; admin_notes?: string | null; reviewed_by?: string | null; reviewed_at?: string | null; created_at: string; updated_at: string; };
export type BetaBugReport = { id: string; tester_id?: string | null; user_id?: string | null; title: string; description?: string | null; steps_to_reproduce?: string | null; expected_result?: string | null; actual_result?: string | null; severity: BetaBugSeverity; feature_area: BetaFeatureArea; page_url?: string | null; screenshot_url?: string | null; browser?: string | null; device?: string | null; turnstile_verified?: boolean | null; turnstile_action?: string | null; turnstile_hostname?: string | null; status: BetaBugStatus; admin_notes?: string | null; reviewed_by?: string | null; reviewed_at?: string | null; created_at: string; updated_at: string; };
export type SearchPerformanceLog = { id: string; user_id?: string | null; session_id?: string | null; source: string; route?: string | null; search_query: string; beta_assignment_id?: string | null; beta_tester_id?: string | null; used_custom_prompt?: boolean | null; parsed_intent?: unknown; search_mode?: string | null; location_area?: string | null; started_at?: string | null; completed_at?: string | null; total_ms?: number | null; llm_ms?: number | null; rpc_ms?: number | null; restaurant_rpc_ms?: number | null; activity_rpc_ms?: number | null; ranking_ms?: number | null; pairing_ms?: number | null; photo_filter_ms?: number | null; result_count?: number | null; restaurant_count?: number | null; activity_count?: number | null; pair_count?: number | null; used_llm?: boolean | null; used_fallback?: boolean | null; timed_out?: boolean | null; speed_status?: SearchSpeedStatus | null; success?: boolean | null; error_message?: string | null; debug?: unknown; created_at: string; };
export type BetaEmailReminder = { id: string; tester_id?: string | null; email: string; reminder_type: BetaReminderType; subject: string; status: BetaReminderStatus; week_start?: string | null; weekly_required_tests?: number | null; weekly_completed_tests?: number | null; incomplete_task_count?: number | null; task_links?: unknown; sent_at?: string | null; error_message?: string | null; created_at: string; };
