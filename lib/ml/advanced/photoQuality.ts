import { clampScore } from './scoring';
function urls(l:any){ return [l?.primary_photo_url,l?.photo_url,...(Array.isArray(l?.photos)?l.photos:[])].filter(Boolean).map(String); }
export function detectDuplicatePhotoRisk(l:any){ const u=urls(l); return u.length>1?clampScore((u.length-new Set(u).size)/u.length*100):0; }
export function detectLogoOnlyRisk(l:any){ return /logo|icon|brand|transparent/i.test(urls(l).join(' '))?65:0; }
export function calculatePhotoQuality(l:any){ const u=urls(l); const dup=detectDuplicatePhotoRisk(l), logo=detectLogoOnlyRisk(l); const has=Boolean(u[0]); const score=clampScore((has?55:10)+Math.min(30,u.length*8)-dup*.3-logo*.25); return { photo_count:u.length, has_primary_photo:has, primary_photo_url:u[0]||null, photo_quality_score:score, primary_photo_score:has?score:0, duplicate_photo_risk_score:dup, logo_only_risk_score:logo, needs_photo_repair:score<50, recommended_photo_actions:score<50?['Add a clear primary photo for public cards']:[] }; }
export function formatPhotoQualitySummary(f:any){ return f?.has_primary_photo?`Photo quality ${Math.round(f.photo_quality_score||0)}.`:'Missing a primary public photo.'; }
