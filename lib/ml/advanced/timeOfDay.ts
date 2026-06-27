import { clampScore } from './scoring';
export function getTimeBucket(d:any=new Date()){ const h=new Date(d).getHours(); if(h<10)return 'morning'; if(h<14)return 'brunch'; if(h<17)return 'afternoon'; if(h<22)return 'dinner'; return 'late_night'; }
export function getDayBucket(d:any=new Date()){ const day=new Date(d).getDay(); return day===5?'friday':day===6?'saturday':day===0?'sunday':'weekday'; }
export function calculateTimeFit(intent:any,f:any,loc:any){ if(!f) return 0; const q=String(intent?.rawQuery||'').toLowerCase(); let s=Number(f.time_fit_score||50); if(/brunch/.test(q)&&/(brunch|breakfast|cafe)/i.test(JSON.stringify(loc))) s+=15; if(/late|night/.test(q)&&/(bar|lounge|night|open late)/i.test(JSON.stringify(loc))) s+=15; return clampScore(s); }
export function formatTimeMlSummary(f:any){ return f?`${f.time_bucket||'This time'} / ${f.day_bucket||'day'} fit score ${Math.round(f.time_fit_score||0)}.`:'No time-of-day data yet.'; }
