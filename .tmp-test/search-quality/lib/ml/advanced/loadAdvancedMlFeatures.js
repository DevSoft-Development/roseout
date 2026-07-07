"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAdvancedMlFeatures = loadAdvancedMlFeatures;
exports.calculateAdvancedMlRankingAdjustments = calculateAdvancedMlRankingAdjustments;
async function getSupabaseAdmin() {
    if (process.env.NODE_ENV === "test" || process.env.VITEST === "true")
        return null;
    try {
        const mod = await Promise.resolve().then(() => __importStar(require('../../supabase-admin')));
        return mod.supabaseAdmin;
    }
    catch {
        return null;
    }
}
async function safe(table, select, column, values) {
    if (!values.length)
        return [];
    const supabaseAdmin = await getSupabaseAdmin();
    if (!supabaseAdmin)
        return [];
    try {
        const { data } = await supabaseAdmin.from(table).select(select).in(column, values);
        return data || [];
    }
    catch {
        return [];
    }
}
async function loadAdvancedMlFeatures({ locationIds = [], pairKeys = [], marketKeys = [], userId }) {
    const ids = [...new Set(locationIds.filter(Boolean))];
    const pairs = [...new Set(pairKeys.filter(Boolean))];
    const markets = [...new Set(marketKeys.filter(Boolean))];
    const [review, result, pair, business, photo, booking, market, user] = await Promise.all([
        safe('location_review_ml_features', '*', 'location_id', ids), safe('search_result_ml_features', '*', 'location_id', ids), safe('location_pair_ml_features', '*', 'pair_key', pairs), safe('business_quality_ml_features', '*', 'location_id', ids), safe('photo_quality_ml_features', '*', 'location_id', ids), safe('booking_likelihood_ml_features', '*', 'location_id', ids), safe('market_ml_features', '*', 'market_key', markets), userId ? safe('user_preference_ml_features', '*', 'user_id', [userId]) : Promise.resolve([])
    ]);
    const byLocation = {};
    for (const rows of [review, result, business, photo, booking])
        for (const r of rows)
            byLocation[r.location_id] = { ...(byLocation[r.location_id] || {}), ...r };
    return { byLocation, byPair: Object.fromEntries(pair.map(r => [r.pair_key, r])), market: Object.fromEntries(market.map(r => [r.market_key, r])), userPreferences: user[0] };
}
function calculateAdvancedMlRankingAdjustments(features, intent) { const confidence = Number(features?.confidence_score ?? features?.review_confidence_score ?? 0.35); const reviewMlBoost = Number(features?.overall_review_quality_score || 0) * 0.025 * confidence; const resultQualityBoost = (Number(features?.result_quality_score || 50) - 50) * 0.04 * confidence; const bookingLikelihoodBoost = /book|reserve|reservation/i.test(String(intent?.rawQuery || '')) ? Number(features?.booking_likelihood_score || 0) * 0.025 : Number(features?.booking_likelihood_score || 0) * 0.008; const businessTrustBoost = Number(features?.business_trust_score || 0) * 0.02; const photoQualityBoost = Number(features?.photo_quality_score || 0) * 0.012; const negativeFeedbackPenalty = Math.min(12, Number(features?.negative_feedback_count || 0) * 2); const duplicateRiskPenalty = Number(features?.duplicate_risk_score || 0) * 0.08; const total = reviewMlBoost + resultQualityBoost + bookingLikelihoodBoost + businessTrustBoost + photoQualityBoost - negativeFeedbackPenalty - duplicateRiskPenalty; return { advancedMlApplied: true, reviewMlBoost, resultQualityBoost, bookingLikelihoodBoost, businessTrustBoost, photoQualityBoost, negativeFeedbackPenalty, duplicateRiskPenalty, advancedMlBoost: Number(total.toFixed(2)) }; }
