"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wantsSoftHours = wantsSoftHours;
exports.evaluateSoftHours = evaluateSoftHours;
function wantsSoftHours(intent) {
    const query = `${intent.rawQuery ?? ""} ${intent.normalizedQuery ?? ""}`.toLowerCase();
    return /\b(open now|tonight|late[- ]night|open late|after midnight|open after midnight)\b/.test(query);
}
function stringify(value) {
    if (value == null)
        return "";
    if (typeof value === "string")
        return value;
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
function evaluateSoftHours(record, intent) {
    if (!wantsSoftHours(intent)) {
        return { confidence: "unknown", boost: 0, reason: "not_hours_query" };
    }
    const hoursText = [
        record.google_current_opening_hours,
        record.google_regular_opening_hours,
        record.hours_raw,
        record.operating_hours,
        record.special_hours,
        record.hours,
    ]
        .map(stringify)
        .join(" ")
        .toLowerCase();
    if (!hoursText.trim()) {
        return { confidence: "unknown", boost: 0, reason: "relaxed_unknown_hours" };
    }
    const status = String(record.hours_confidence ?? "").toLowerCase();
    const hasVerifiedSource = Boolean(record.google_current_opening_hours || record.google_regular_opening_hours || record.hours_raw);
    const openNow = /"?open_now"?\s*:\s*true|open now/.test(hoursText);
    const closedNow = /"?open_now"?\s*:\s*false|closed now/.test(hoursText);
    const openLate = /12:\d{2}\s*(am|a\.m\.)|1:\d{2}\s*(am|a\.m\.)|2:\d{2}\s*(am|a\.m\.)|3:\d{2}\s*(am|a\.m\.)|4:\d{2}\s*(am|a\.m\.)|24 hours|open 24 hours|12:00\s*am|00:/.test(hoursText);
    if (openNow || openLate) {
        return { confidence: hasVerifiedSource || status === "verified" ? "verified" : "likely", boost: openNow ? 45 : 30, reason: "late_night_hours_soft_filter" };
    }
    if (closedNow && hasVerifiedSource) {
        return { confidence: "closed", boost: -20, reason: "known_closed_rank_lower" };
    }
    return { confidence: "unknown", boost: 0, reason: "relaxed_unknown_hours" };
}
