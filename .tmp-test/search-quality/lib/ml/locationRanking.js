"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ML_SCORE_VERSION = void 0;
exports.calculateLocationMlScore = calculateLocationMlScore;
exports.calculateMlBoost = calculateMlBoost;
exports.ML_SCORE_VERSION = "ml_rank_v1";
function n(value) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}
function cap(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function calculateLocationMlScore(input) {
    const impressions = n(input.impressions_30d);
    const views = n(input.views_30d);
    const clicks = n(input.clicks_30d);
    const saves = n(input.saves_30d);
    const completions = n(input.completed_outings_30d);
    const reservationClicks = n(input.reservation_clicks_30d);
    const callClicks = n(input.call_clicks_30d);
    const websiteClicks = n(input.website_clicks_30d);
    const negatives = n(input.negative_signals_30d);
    const ctr = input.ctr_30d == null ? clicks / Math.max(impressions, 1) : n(input.ctr_30d);
    const conversions = reservationClicks + callClicks + websiteClicks + saves + completions;
    const conversionRate = input.conversion_rate_30d == null ? conversions / Math.max(views + clicks, 1) : n(input.conversion_rate_30d);
    if (impressions === 0 && views === 0 && clicks === 0 && conversions === 0)
        return 0;
    const ctrScore = cap(ctr, 0, 1) * 25;
    const conversionScore = cap(conversionRate, 0, 1) * 30;
    const engagementScore = cap(Math.log1p(clicks * 2 + views * 0.25 + saves * 5 + completions * 8) * 7, 0, 25);
    const qualityScore = cap(n(input.quality_component), 0, 100) * 0.12;
    const freshnessScore = cap(n(input.freshness_score), 0, 10);
    const negativePenalty = cap(negatives * 7, 0, 35);
    let score = ctrScore + conversionScore + engagementScore + qualityScore + freshnessScore - negativePenalty;
    if (impressions < 10)
        score *= 0.35;
    else if (impressions < 25)
        score *= 0.65;
    return Number(cap(score, 0, 100).toFixed(2));
}
function calculateMlBoost(mlScore) {
    const score = Number(mlScore ?? 0);
    if (!Number.isFinite(score))
        return 0;
    return Math.min(20, Math.max(0, score) * 0.15);
}
