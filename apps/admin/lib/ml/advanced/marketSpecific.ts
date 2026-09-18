import { clampScore } from './scoring';
export function getMarketKey(x:any){ return String(x?.market_key||x?.market||x?.city||'unknown').toLowerCase().trim().replace(/\s+/g,'-'); }
export function calculateMarketPreferences(events:any[]){ return { search_count:events.length, walking_preference_score:clampScore(events.filter(e=>Number(e.distance_miles||0)<2).length/events.length*100), driving_preference_score:clampScore(events.filter(e=>Number(e.distance_miles||0)>=2).length/events.length*100) }; }
export function calculateMarketFit(_intent:any,m:any,p:any){ if(!m) return 0; const d=Number(p?.distance_miles||0); return clampScore(50 + (d<2?Number(m.walking_preference_score||0):Number(m.driving_preference_score||0))*0.25); }
export function formatMarketMlSummary(f:any){ return f?`Market behavior confidence ${Math.round(f.confidence_score||0)}%.`:'No market-specific data yet.'; }
