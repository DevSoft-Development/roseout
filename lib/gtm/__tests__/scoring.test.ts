import { describe, expect, it } from 'vitest';
import { calculateOpportunity, nextBestAction, scoreContactability, scoreDemand } from '../scoring';

const zero={searchImpressions30d:0,views30d:0,saves30d:0,reservationClicks30d:0,callClicks30d:0,websiteClicks30d:0,outingInclusions30d:0,qrScans30d:0,emailClicks30d:0,claimViews30d:0,claimStarts30d:0,replies30d:0};

describe('GTM scoring',()=>{
  it('treats missing reservations and website as opportunity, not disqualification',()=>{const score=calculateOpportunity({id:'1',is_searchable:true,rating:4.7,review_count:800,address:'1 Main',phone:'555',neighborhood:'Astoria'},zero); expect(score.components.businessGap).toBeGreaterThanOrEqual(20); expect(score.opportunityScore).toBeGreaterThan(30);});
  it('includes demand from day one',()=>{const low=scoreDemand(zero); const high=scoreDemand({...zero,searchImpressions30d:100,views30d:40,saves30d:10,outingInclusions30d:15}); expect(high).toBeGreaterThan(low);});
  it('treats QR scan as strong sales intent',()=>{const base=calculateOpportunity({id:'1',rating:4.5,review_count:300,address:'x',phone:'y'},zero); const scanned=calculateOpportunity({id:'1',rating:4.5,review_count:300,address:'x',phone:'y'},{...zero,qrScans30d:1}); expect(scanned.opportunityScore).toBeGreaterThan(base.opportunityScore); expect(nextBestAction({location:{id:'1',phone:'y'},score:scanned,metrics:{...zero,qrScans30d:1},hasEmail:false,hasAccount:true}).type).toBe('call');});
  it('does not require email to score a strong opportunity',()=>{expect(scoreContactability({id:'1',address:'x',phone:'y'},false)).toBe(50);});
});
