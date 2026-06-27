export const FEEDBACK_TYPES = new Set(['not_a_fit','too_far','wrong_vibe','too_expensive','too_loud','too_quiet','wrong_category','bad_pair','closed_or_unavailable','duplicate','bad_photo','other']);
export function normalizeFeedbackType(type:any){ const t=String(type||'other').toLowerCase().replace(/\s+/g,'_'); return FEEDBACK_TYPES.has(t)?t:'other'; }
export function scoreNegativeFeedback(f:any){ const t=normalizeFeedbackType(f?.feedback_type||f); return ['duplicate','closed_or_unavailable','wrong_category','bad_pair'].includes(t)?12:7; }
export function applyFeedbackPenalty(_intent:any,features:any){ const count=Number(features?.negative_feedback_count||0); if(count<=1) return 1.5; if(count===2) return 4; return Math.min(18, count*3); }
export function formatFeedbackSummary(f:any){ return f?.negative_feedback_count?`${f.negative_feedback_count} similar feedback items limit ranking boost.`:'No meaningful negative feedback pattern.'; }
