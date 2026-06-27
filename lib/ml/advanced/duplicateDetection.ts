import { clampScore } from './scoring';
function norm(s:any){ return String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').trim(); }
function sim(a:any,b:any){ const A=new Set(norm(a).split(/\s+/).filter(Boolean)), B=new Set(norm(b).split(/\s+/).filter(Boolean)); if(!A.size||!B.size)return 0; return [...A].filter(x=>B.has(x)).length/Math.max(A.size,B.size)*100; }
export const calculateNameSimilarity=sim; export const calculateAddressSimilarity=sim; export function calculateGeoSimilarity(a:any,b:any){ const dx=Number(a?.latitude||0)-Number(b?.latitude||0), dy=Number(a?.longitude||0)-Number(b?.longitude||0); const d=Math.sqrt(dx*dx+dy*dy); return clampScore(100-d*8000); }
export function calculateDuplicateConfidence(a:any,b:any){ return clampScore(sim(a?.name||a?.restaurant_name||a?.activity_name,b?.name||b?.restaurant_name||b?.activity_name)*.35+sim(a?.address,b?.address)*.3+(a?.phone&&a.phone===b?.phone?20:0)+calculateGeoSimilarity(a,b)*.15); }
export function formatDuplicateCandidateSummary(c:any){ return `Duplicate confidence ${Math.round(c?.duplicate_confidence_score||0)}. Admin review required; no auto-merge.`; }
