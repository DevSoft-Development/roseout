from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import base_core as core


DEFAULT_REQUIRED_TASKS = 5


def normalized_email(value):
    return core.text(value).strip().lower()


def integer(value, default=0):
    try:
        return int(value if value is not None else default)
    except (TypeError, ValueError):
        return int(default)


def current_week_start():
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=now.weekday())
    return start.date().isoformat()


def eligibility_for_entry(entry, tester_by_email, sessions_by_tester, week_start):
    email = normalized_email(entry.get("email"))
    if not email:
        return {
            "isBetaTester": False,
            "betaStatus": None,
            "weeklyRequiredTasks": 0,
            "completedThisWeek": 0,
            "requiredThisWeek": 0,
            "weeklyTasksComplete": True,
            "eligibilityStatus": "not_beta_yet",
            "reason": "No email provided.",
        }

    tester = tester_by_email.get(email)
    if not tester:
        return {
            "isBetaTester": False,
            "betaStatus": None,
            "weeklyRequiredTasks": 0,
            "completedThisWeek": 0,
            "requiredThisWeek": 0,
            "weeklyTasksComplete": True,
            "eligibilityStatus": "not_beta_yet",
            "reason": "Not approved as a beta tester yet.",
        }

    beta_status = core.text(tester.get("status")) or None
    required = integer(tester.get("weekly_required_tests"), DEFAULT_REQUIRED_TASKS) or DEFAULT_REQUIRED_TASKS
    if beta_status != "active":
        return {
            "isBetaTester": True,
            "betaStatus": beta_status,
            "weeklyRequiredTasks": required,
            "completedThisWeek": 0,
            "requiredThisWeek": required,
            "weeklyTasksComplete": False,
            "eligibilityStatus": "ineligible",
            "reason": f"Beta tester status is {beta_status or 'unknown'}.",
        }

    completed = 0
    for session in sessions_by_tester.get(str(tester.get("id")), []):
        if core.text(session.get("week_start_date")) != week_start or bool(session.get("test_mode")):
            continue
        steps = session.get("completed_steps")
        if isinstance(steps, list):
            session_completed = len(steps)
        elif core.text(session.get("status")) == "completed" or session.get("completed_at"):
            session_completed = required
        else:
            session_completed = 0
        completed = max(completed, session_completed)

    complete = completed >= required
    return {
        "isBetaTester": True,
        "betaStatus": beta_status,
        "weeklyRequiredTasks": required,
        "completedThisWeek": completed,
        "requiredThisWeek": required,
        "weeklyTasksComplete": complete,
        "eligibilityStatus": "eligible" if complete else "pending_beta_tasks",
        "reason": "Weekly beta task goal complete."
        if complete
        else f"Weekly beta tasks pending: {completed} / {required} completed.",
    }


def giveaway_entries(entry, eligibility):
    prize_ready = bool(
        entry.get("wants_giveaway")
        and not entry.get("duplicate_flag")
        and core.text(entry.get("giveaway_status")) != "disqualified"
        and eligibility.get("weeklyTasksComplete")
        and eligibility.get("isBetaTester")
    )
    platform = core.text(entry.get("social_platform")).lower()
    instagram = bool(entry.get("followed_social") and platform in {"instagram", "both"})
    tiktok = bool(entry.get("followed_social") and platform in {"tiktok", "both"})
    return {
        "prizeReady": prize_ready,
        "baseEntry": 1 if prize_ready else 0,
        "instagramBonus": 1 if instagram else 0,
        "tiktokBonus": 1 if tiktok else 0,
        "totalEntries": 1 + int(instagram) + int(tiktok) if prize_ready else 0,
    }


def read_beta_dashboard(payload):
    core.load_secret(core.SUPABASE_SERVICE_ROLE_SECRET_ID)

    jobs = {
        "entries": lambda: core.supabase_rows(
            "launch_waitlist_signups",
            "*",
            [("order", "created_at.desc")],
            limit=500,
        )[0],
        "duplicates": lambda: core.supabase_rows(
            "launch_waitlist_duplicate_events",
            "*",
            [("order", "created_at.desc")],
            limit=50,
        )[0],
        "applications": lambda: core.supabase_rows(
            "beta_applications",
            "*",
            [("order", "created_at.desc")],
            limit=500,
        )[0],
        "testers": lambda: core.supabase_rows(
            "beta_testers",
            "*",
            [("order", "created_at.desc")],
            limit=500,
        )[0],
        "sessions": lambda: core.supabase_rows(
            "beta_test_sessions",
            "*,beta_testers(email,name,full_name,status)",
            [("order", "created_at.desc")],
            limit=500,
        )[0],
        "feedback": lambda: core.supabase_rows(
            "beta_feedback",
            "*,beta_testers(email,name,full_name)",
            [("order", "created_at.desc")],
            limit=500,
        )[0],
        "bugs": lambda: core.supabase_rows(
            "beta_bug_reports",
            "*,beta_testers(email,name,full_name)",
            [("order", "created_at.desc")],
            limit=500,
        )[0],
        "flags": lambda: core.supabase_rows(
            "feature_flags",
            "key,enabled",
            [("key", "in.(weekly_beta_enabled,weekly_beta_e2e_test_mode_enabled)")],
            limit=2,
        )[0],
    }

    results = {}
    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        futures = {name: pool.submit(fn) for name, fn in jobs.items()}
        for name, future in futures.items():
            results[name] = future.result()

    testers = results["testers"]
    sessions = results["sessions"]
    tester_by_email = {
        normalized_email(row.get("email")): row
        for row in testers
        if normalized_email(row.get("email"))
    }
    sessions_by_tester = {}
    for session in sessions:
        tester_id = session.get("tester_id")
        if tester_id:
            sessions_by_tester.setdefault(str(tester_id), []).append(session)

    week_start = current_week_start()
    entries = []
    giveaway_calculations = []
    for entry in results["entries"]:
        eligibility = eligibility_for_entry(entry, tester_by_email, sessions_by_tester, week_start)
        giveaway = giveaway_entries(entry, eligibility)
        giveaway_calculations.append(giveaway)
        entries.append({**entry, "beta_giveaway_eligibility": eligibility})

    weekly_sessions = []
    for session in sessions:
        completed_steps = session.get("completed_steps")
        completed_count = min(len(completed_steps), 5) if isinstance(completed_steps, list) else 0
        weekly_sessions.append({
            **session,
            "weekly_completed_tests": completed_count,
            "weekly_required_tests": 5,
            "mode_label": "Test mode" if session.get("test_mode") else "Real",
        })

    active_beta_users = [
        row for row in testers if core.text(row.get("status")) in {"active", "approved"}
    ]
    flags = {core.text(row.get("key")): bool(row.get("enabled")) for row in results["flags"]}

    overview = {
        "totalApplicants": len(results["applications"]),
        "approvedTesters": sum(1 for row in testers if core.text(row.get("status")) in {"approved", "active"}),
        "activeTesters": sum(1 for row in testers if core.text(row.get("status")) == "active"),
        "weeklySessionsStarted": sum(
            1 for row in sessions if not row.get("test_mode") and core.text(row.get("status")) != "not_started"
        ),
        "weeklySessionsCompleted": sum(
            1 for row in sessions if not row.get("test_mode") and core.text(row.get("status")) == "completed"
        ),
        "testSessions": sum(1 for row in sessions if row.get("test_mode")),
        "feedbackSubmitted": len(results["feedback"]),
        "bugReports": len(results["bugs"]),
        "prizeReadyTesters": sum(1 for row in giveaway_calculations if row.get("prizeReady")),
        "totalGiveawayEntries": sum(integer(row.get("totalEntries")) for row in giveaway_calculations),
        "needsReview": sum(
            1
            for row in results["entries"]
            if row.get("duplicate_flag") or core.text(row.get("giveaway_status")) == "pending_verification"
        ),
    }

    return {
        "success": True,
        "weekStart": week_start,
        "entries": entries,
        "duplicateEvents": results["duplicates"],
        "applications": results["applications"],
        "feedback": results["feedback"],
        "bugs": results["bugs"],
        "weeklySessions": weekly_sessions,
        "overview": overview,
        "activeBetaUsers": active_beta_users,
        "weeklyBetaSettings": {
            "weekly_beta_enabled": flags.get("weekly_beta_enabled", False),
            "weekly_beta_e2e_test_mode_enabled": flags.get("weekly_beta_e2e_test_mode_enabled", False),
        },
    }
