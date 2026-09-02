from concurrent.futures import ThreadPoolExecutor
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid

import base_core as core

MAX_SOURCE_ROWS = 1000
MAX_DETAIL_ROWS = 50


def email_key(value):
    return core.text(value).lower()


def safe(callable_, fallback):
    try:
        return callable_()
    except Exception:
        return fallback


def auth_admin_get(path, query=None):
    if not core.SUPABASE_URL.startswith("https://"):
        raise RuntimeError("supabase_url_not_configured")
    service_role = core.load_secret(core.SUPABASE_SERVICE_ROLE_SECRET_ID)
    suffix = "?" + urllib.parse.urlencode(query) if query else ""
    request = urllib.request.Request(
        f"{core.SUPABASE_URL}/auth/v1/admin{path}{suffix}",
        method="GET",
        headers={
            "accept": "application/json",
            "apikey": service_role,
            "authorization": f"Bearer {service_role}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=core.SUPABASE_TIMEOUT_SECONDS) as upstream:
            payload = json.loads(upstream.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        body = exc.read(1200).decode("utf-8", errors="replace")
        raise RuntimeError(f"supabase_auth_http_{exc.code}:{body}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("supabase_auth_unavailable") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("supabase_auth_response_invalid")
    return payload


def auth_users():
    payload = auth_admin_get("/users", {"page": 1, "per_page": MAX_SOURCE_ROWS}) or {}
    users = payload.get("users")
    return users if isinstance(users, list) else []


def auth_user_by_id(user_id):
    payload = auth_admin_get(f"/users/{urllib.parse.quote(user_id, safe='')}")
    if not isinstance(payload, dict):
        return None
    user = payload.get("user")
    if isinstance(user, dict):
        return user
    return payload if payload.get("id") else None


def rows(table, select="*", params=None, limit=MAX_SOURCE_ROWS):
    payload, _ = core.supabase_rows(table, select, params or [], limit=limit)
    return payload


def merge_user_records(profiles, app_users, beta_rows, beta_apps, launch_rows, auth_rows):
    auth_by_id = {core.text(item.get("id")): item for item in auth_rows if core.text(item.get("id"))}
    auth_by_email = {email_key(item.get("email")): item for item in auth_rows if email_key(item.get("email"))}
    merged = {}

    def find_key(user_id=None, email=None):
        user_id = core.text(user_id)
        email = email_key(email)
        if user_id and f"user:{user_id}" in merged:
            return f"user:{user_id}"
        if email and f"email:{email}" in merged:
            return f"email:{email}"
        for key, value in merged.items():
            if user_id and (core.text(value.get("id")) == user_id or core.text(value.get("user_id")) == user_id):
                return key
            if email and email_key(value.get("email")) == email:
                return key
        if user_id:
            return f"user:{user_id}"
        if email:
            return f"email:{email}"
        return f"row:{uuid.uuid4()}"

    def put(row):
        row = dict(row or {})
        key = find_key(row.get("id") or row.get("user_id"), row.get("email"))
        previous = merged.get(key, {})
        badges = []
        for badge in list(previous.get("badges") or []) + list(row.get("badges") or []):
            if badge and badge not in badges:
                badges.append(badge)
        item = {**previous, **row, "badges": badges}
        item["id"] = row.get("id") or row.get("user_id") or previous.get("id") or previous.get("user_id")
        if not item.get("email"):
            item["email"] = previous.get("email")
        if not item.get("full_name"):
            item["full_name"] = previous.get("full_name") or previous.get("name")
        merged.pop(key, None)
        final_key = f"user:{item['id']}" if item.get("id") else f"email:{email_key(item.get('email'))}"
        merged[final_key] = item

    for item in profiles:
        put({**item, "hasAccount": True, "badges": ["Account User"]})
    for item in app_users:
        put({**item, "id": item.get("id") or item.get("user_id"), "full_name": item.get("full_name") or item.get("name"), "hasAccount": True, "badges": ["Account User"]})
    for item in auth_rows:
        metadata = item.get("user_metadata") if isinstance(item.get("user_metadata"), dict) else {}
        put({
            "id": item.get("id"),
            "email": item.get("email"),
            "full_name": metadata.get("full_name") or metadata.get("name"),
            "created_at": item.get("created_at"),
            "email_confirmed_at": item.get("email_confirmed_at"),
            "last_sign_in_at": item.get("last_sign_in_at"),
            "hasAccount": True,
            "badges": ["Account User"],
        })
    for item in beta_apps:
        put({**item, "email": item.get("email"), "full_name": item.get("name"), "beta_status": item.get("status"), "betaApplicationId": item.get("id"), "badges": ["Beta Applicant"]})
    for item in launch_rows:
        launch_badges = ["Launch List"]
        if item.get("wants_giveaway") and item.get("giveaway_status") == "verified":
            launch_badges.append("Giveaway Eligible")
        elif item.get("giveaway_status") == "pending_beta_tasks" or item.get("weekly_task_eligibility_status") == "pending_beta_tasks":
            launch_badges.append("Pending Weekly Tasks")
        elif item.get("wants_giveaway"):
            launch_badges.append("Giveaway Pending")
        if not item.get("email_verified"):
            launch_badges.append("Email Unverified")
        put({
            **item,
            "email": item.get("email"),
            "full_name": item.get("full_name"),
            "beta_status": item.get("beta_application_status"),
            "giveaway_status": item.get("giveaway_status"),
            "launchSignupId": item.get("id"),
            "badges": launch_badges,
        })
    for item in beta_rows:
        auth = auth_by_id.get(core.text(item.get("user_id"))) or auth_by_email.get(email_key(item.get("email"))) or {}
        put({
            **item,
            "id": item.get("user_id") or auth.get("id"),
            "email": item.get("email") or auth.get("email"),
            "full_name": item.get("name"),
            "beta_status": item.get("status"),
            "betaTesterId": item.get("id"),
            "betaTester": item,
            "isBetaUser": True,
            "hasAccount": bool(item.get("user_id") or auth.get("id")),
            "badges": ["Beta Tester"],
        })
    return merged, auth_by_id


def count_rows_by_id(table, ids, column="user_id", open_only=False):
    if not ids:
        return {}
    params = [(column, "in.(" + ",".join(ids) + ")")]
    if open_only:
        params.append(("status", "not.in.(closed,resolved)"))
    result = rows(table, column, params)
    counts = {}
    for item in result:
        key = core.text(item.get(column))
        if key:
            counts[key] = counts.get(key, 0) + 1
    return counts


def open_ticket_counts_by_email(emails):
    if not emails:
        return {}
    result = rows("support_tickets", "requester_email,email,status", [("status", "not.in.(closed,resolved)")])
    wanted = set(emails)
    counts = {}
    for item in result:
        key = email_key(item.get("requester_email") or item.get("email"))
        if key and key in wanted:
            counts[key] = counts.get(key, 0) + 1
    return counts


def decorate_user(item, admins_by_id, subscriptions_by_id, saved, booked, tickets_by_user, tickets_by_email, auth_by_id):
    user = dict(item)
    user_id = core.text(user.get("id"))
    admin = admins_by_id.get(user_id) or {}
    subscription = subscriptions_by_id.get(user_id) or {}
    auth = auth_by_id.get(user_id) or {}
    has_account = bool(user.get("hasAccount") or user_id)
    email_confirmed = user.get("email_confirmed_at") or auth.get("email_confirmed_at")
    disabled = bool(
        user.get("account_status") == "disabled"
        or user.get("deleted_at")
        or user.get("disabled_at")
        or admin.get("role") == "disabled"
        or user.get("role") == "disabled"
    )
    role = admin.get("role") or user.get("role") or "user"
    plan = subscription.get("plan_key") or user.get("plan") or ("free" if has_account else "Pending")
    row_key = user_id or user.get("betaTesterId") or user.get("betaApplicationId") or user.get("launchSignupId") or user.get("email")
    detail_token = user_id or user.get("betaTesterId") or user.get("betaApplicationId") or user.get("launchSignupId")
    user.update({
        "userId": user_id or None,
        "rowKey": row_key,
        "role": role,
        "plan": plan,
        "isBetaUser": bool(user.get("isBetaUser") or user.get("betaTesterId")),
        "saved_outings_count": saved.get(user_id, 0) if user_id else 0,
        "booked_outings_count": booked.get(user_id, 0) if user_id else 0,
        "open_tickets_count": (tickets_by_user.get(user_id, 0) if user_id else 0) + tickets_by_email.get(email_key(user.get("email")), 0),
        "hasAccount": has_account,
        "account_status": "disabled" if disabled else ("active" if email_confirmed else "email_unverified") if has_account else "pending_account",
        "detailHref": f"/admin/dashboard/users/{user_id}" if user_id else f"/admin/dashboard/users/{detail_token}?type=lead",
    })
    return user


def matches_filters(user, filters):
    query = email_key(filters.get("q"))
    if query:
        fields = [user.get("full_name"), user.get("preferred_name"), user.get("email"), user.get("phone"), user.get("mobile_number"), user.get("zip_code"), user.get("social_handle")]
        if not any(query in core.text(value).lower() for value in fields):
            return False
    beta = core.text(filters.get("beta"))
    if beta and beta != "all" and core.text(user.get("beta_status") or ("active" if user.get("isBetaUser") else "none")) != beta:
        return False
    plan = core.text(filters.get("plan"))
    if plan and plan != "all" and core.text(user.get("plan")) != plan:
        return False
    email_status = core.text(filters.get("email"))
    if email_status and email_status != "all" and ((email_status == "verified") != bool(user.get("email_confirmed_at") or user.get("email_verified"))):
        return False
    status = core.text(filters.get("status"))
    if status and status != "all" and status.lower() not in core.text(user.get("account_status")).lower():
        return False
    giveaway = core.text(filters.get("giveaway"))
    if giveaway and giveaway != "all" and core.text(user.get("giveaway_status")) != giveaway:
        return False
    if filters.get("tickets") == "yes" and int(user.get("open_tickets_count") or 0) < 1:
        return False
    if filters.get("booked") == "yes" and int(user.get("booked_outings_count") or 0) < 1:
        return False
    role = core.text(filters.get("role"))
    if role and role != "all" and core.text(user.get("role")).lower() != role.lower():
        return False
    return True


def read_admin_users_list(payload):
    core.load_secret(core.SUPABASE_SERVICE_ROLE_SECRET_ID)
    filters = payload.get("filters") if isinstance(payload.get("filters"), dict) else payload
    try:
        page = max(1, int(filters.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    per = 25

    jobs = {
        "profiles": ("user_profiles", [("order", "created_at.desc")]),
        "app_users": ("users", [("order", "created_at.desc")]),
        "beta_rows": ("beta_testers", [("order", "created_at.desc")]),
        "beta_apps": ("beta_applications", [("order", "created_at.desc")]),
        "launch_rows": ("launch_waitlist_signups", [("order", "created_at.desc")]),
    }
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {name: pool.submit(rows, table, "*", params) for name, (table, params) in jobs.items()}
        auth_future = pool.submit(auth_users)
        source = {name: safe(future.result, []) for name, future in futures.items()}
        auth_rows = safe(auth_future.result, [])

    merged, auth_by_id = merge_user_records(source["profiles"], source["app_users"], source["beta_rows"], source["beta_apps"], source["launch_rows"], auth_rows)
    values = list(merged.values())
    ids = sorted({core.text(item.get("id")) for item in values if core.text(item.get("id"))})
    emails = sorted({email_key(item.get("email")) for item in values if email_key(item.get("email"))})

    def admin_rows():
        return rows("admin_users", "user_id,role", [("user_id", "in.(" + ",".join(ids) + ")")]) if ids else []

    def subscription_rows():
        return rows("customer_subscriptions", "user_id,plan_key,status", [("user_id", "in.(" + ",".join(ids) + ")"), ("status", "eq.active")]) if ids else []

    with ThreadPoolExecutor(max_workers=6) as pool:
        admins_f = pool.submit(admin_rows)
        saved_f = pool.submit(count_rows_by_id, "saved_plans", ids)
        booked_f = pool.submit(count_rows_by_id, "user_outings", ids)
        tickets_user_f = pool.submit(count_rows_by_id, "support_tickets", ids, "user_id", True)
        tickets_email_f = pool.submit(open_ticket_counts_by_email, emails)
        subscriptions_f = pool.submit(subscription_rows)
        admins = safe(admins_f.result, [])
        saved = safe(saved_f.result, {})
        booked = safe(booked_f.result, {})
        tickets_by_user = safe(tickets_user_f.result, {})
        tickets_by_email = safe(tickets_email_f.result, {})
        subscriptions = safe(subscriptions_f.result, [])

    admins_by_id = {core.text(item.get("user_id")): item for item in admins if core.text(item.get("user_id"))}
    subscriptions_by_id = {core.text(item.get("user_id")): item for item in subscriptions if core.text(item.get("user_id"))}
    users = [decorate_user(item, admins_by_id, subscriptions_by_id, saved, booked, tickets_by_user, tickets_by_email, auth_by_id) for item in values]
    users = [item for item in users if matches_filters(item, filters)]
    users.sort(key=lambda item: core.text(item.get("created_at")), reverse=True)
    start = (page - 1) * per
    return {"success": True, "users": users[start:start + per], "count": len(users), "page": page, "per": per, "hasMore": len(users) > start + per}


def list_detail_rows(table, user_id, column="user_id"):
    if not user_id:
        return []
    return rows(table, "*", [(column, f"eq.{user_id}"), ("order", "created_at.desc")], limit=MAX_DETAIL_ROWS)


def list_tickets(user_id, email):
    clauses = [f"user_id.eq.{user_id}"] if user_id else []
    if email:
        safe_email = str(email).replace(",", "")
        clauses.extend([f"requester_email.eq.{safe_email}", f"email.eq.{safe_email}"])
    if not clauses:
        return []
    return rows("support_tickets", "*", [("or", "(" + ",".join(clauses) + ")"), ("order", "updated_at.desc")], limit=MAX_DETAIL_ROWS)


def read_admin_user_detail(payload):
    requested_id = core.text(payload.get("userId"))
    if not requested_id:
        raise ValueError("userId_required")
    core.load_secret(core.SUPABASE_SERVICE_ROLE_SECRET_ID)

    with ThreadPoolExecutor(max_workers=2) as pool:
        profile_f = pool.submit(core.supabase_get, "user_profiles", "*", [("id", f"eq.{requested_id}")])
        auth_f = pool.submit(auth_user_by_id, requested_id) if core.valid_uuid(requested_id) else None
        profile = safe(profile_f.result, None)
        auth = safe(auth_f.result, None) if auth_f else None

    email = (profile or {}).get("email") or (auth or {}).get("email")
    beta_filters = [f"user_id.eq.{requested_id}"]
    if email:
        beta_filters.append(f"email.eq.{str(email).replace(',', '')}")
    beta = safe(lambda: core.supabase_get("beta_testers", "*", [("or", "(" + ",".join(beta_filters) + ")")]), None)
    if not profile and not auth and not beta:
        beta = safe(lambda: core.supabase_get("beta_testers", "*", [("id", f"eq.{requested_id}")]), None)

    resolved_id = core.text((profile or {}).get("id") or (auth or {}).get("id") or (beta or {}).get("user_id"))
    resolved_email = (profile or {}).get("email") or (auth or {}).get("email") or (beta or {}).get("email")
    beta_id = core.text((beta or {}).get("id"))

    def admin_role():
        return core.supabase_get("admin_users", "role", [("user_id", f"eq.{resolved_id}")]) if resolved_id else None

    def subscription():
        return core.supabase_get("customer_subscriptions", "*", [("user_id", f"eq.{resolved_id}"), ("order", "created_at.desc")]) if resolved_id else None

    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {
            "admin": pool.submit(admin_role),
            "saved": pool.submit(list_detail_rows, "saved_plans", resolved_id),
            "booked": pool.submit(list_detail_rows, "user_outings", resolved_id),
            "reservations": pool.submit(list_detail_rows, "location_reservations", resolved_id),
            "tickets": pool.submit(list_tickets, resolved_id or requested_id, resolved_email),
            "usage": pool.submit(list_detail_rows, "search_usage_events", resolved_id, "auth_user_id"),
            "subscription": pool.submit(subscription),
            "betaAssignments": pool.submit(list_detail_rows, "beta_task_assignments", beta_id, "tester_id"),
            "betaFeedback": pool.submit(list_detail_rows, "beta_feedback", beta_id, "tester_id"),
            "betaBugReports": pool.submit(list_detail_rows, "beta_bug_reports", beta_id, "tester_id"),
        }
        result = {name: safe(future.result, None if name in {"admin", "subscription"} else []) for name, future in futures.items()}

    metadata = (auth or {}).get("user_metadata") if isinstance((auth or {}).get("user_metadata"), dict) else {}
    has_account = bool(resolved_id)
    admin = result.get("admin") or {}
    base_profile = dict(profile or {})
    base_profile.update({
        "id": resolved_id or (beta or {}).get("id") or requested_id,
        "email": resolved_email,
        "full_name": (profile or {}).get("full_name") or (beta or {}).get("name") or metadata.get("full_name"),
        "phone": (profile or {}).get("phone") or (beta or {}).get("phone"),
        "role": admin.get("role") or (profile or {}).get("role") or "user",
        "plan": (result.get("subscription") or {}).get("plan_key") or (profile or {}).get("plan") or ("free" if has_account else "Pending"),
        "email_confirmed_at": (auth or {}).get("email_confirmed_at"),
        "created_at": (profile or {}).get("created_at") or (auth or {}).get("created_at") or (beta or {}).get("created_at"),
        "hasAccount": has_account,
    })
    disabled = bool((profile or {}).get("deleted_at") or (profile or {}).get("disabled_at") or admin.get("role") == "disabled")
    base_profile["account_status"] = (profile or {}).get("account_status") or ("disabled" if disabled else ("active" if (auth or {}).get("email_confirmed_at") else "email_unverified") if has_account else "pending_account")

    return {
        "success": True,
        "profile": base_profile,
        "beta": beta,
        "saved": result["saved"],
        "booked": result["booked"],
        "reservations": result["reservations"],
        "tickets": result["tickets"],
        "usage": result["usage"],
        "subscription": result["subscription"],
        "betaAssignments": result["betaAssignments"],
        "betaFeedback": result["betaFeedback"],
        "betaBugReports": result["betaBugReports"],
    }
