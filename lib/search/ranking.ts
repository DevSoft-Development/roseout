import type { ScoredPair, SearchLocation } from './types';

function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function scorePair(pair:ScoredPair){
  const r = pair.restaurant as SearchLocation;
  const a = pair.activity as SearchLocation;
  const proBoost=(r.is_pro?20:0)+(a.is_pro?20:0);
  const ratingBoost=(n(r.rating)+n(a.rating))*4;
  const popBoost=n(r.popularity_score)+n(a.popularity_score);
  const score=200-(pair.distanceMiles*80)+proBoost+ratingBoost+popBoost;
  return {...pair, score};
}

export function rankPairs(pairs:ScoredPair[]){
  return pairs.map(scorePair).sort((a,b)=>b.score-a.score || a.distanceMiles-b.distanceMiles);
}
