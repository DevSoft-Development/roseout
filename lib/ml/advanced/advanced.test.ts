import { describe, expect, it } from 'vitest';
import { aggregateReviewSignals, calculateIntentReviewFit } from './reviewIntelligence';
import { calculateResultQualityScore } from './resultQuality';
import { calculateDistanceFit } from './pairCompatibility';
import { normalizeFeedbackType } from './negativeFeedback';
import { calculateBookingLikelihood } from './bookingLikelihood';
import { calculateBusinessQuality } from './businessQuality';
import { calculateDuplicateConfidence } from './duplicateDetection';
import { calculatePhotoQuality } from './photoQuality';
import { assignLeadPriority, calculateOwnerLeadScore } from './ownerLeadScoring';

describe('advanced ML utilities', () => {
  it('keeps one loud review from meaningfully hurting quiet intent', () => {
    const features = aggregateReviewSignals([{ rating: 4, verified_visit: true, review_text: 'A little loud but fun.', status: 'approved' }]);
    expect(features.noise_penalty).toBeLessThan(5);
    expect(calculateIntentReviewFit({ rawQuery: 'quiet date night' }, features)).toBeGreaterThanOrEqual(-1);
  });
  it('creates a stronger quiet-search caution from repeated verified loud reviews', () => {
    const features = aggregateReviewSignals(Array.from({ length: 3 }, () => ({ rating: 3, verified_visit: true, review_text: 'Very loud and noisy for dinner.', status: 'approved' })));
    expect(features.noise_penalty).toBeGreaterThan(10);
    expect(calculateIntentReviewFit({ rawQuery: 'quiet date night' }, features)).toBeLessThan(0);
  });
  it('boosts lively group occasions from loud/lively signals', () => {
    const features = aggregateReviewSignals([{ rating: 5, verified_visit: true, review_text: 'Loud lively birthday party with friends and photos.', status: 'approved' }]);
    expect(calculateIntentReviewFit({ rawQuery: 'girls night birthday' }, features)).toBeGreaterThan(0);
  });
  it('scores result outcomes with positives and negatives', () => {
    expect(calculateResultQualityScore({ shown_count: 10, click_count: 2, save_count: 1, complete_count: 1 })).toBeGreaterThan(calculateResultQualityScore({ shown_count: 10, negative_feedback_count: 2, bounce_count: 3 }));
  });
  it('validates feedback types', () => { expect(normalizeFeedbackType('Too Far')).toBe('too_far'); expect(normalizeFeedbackType('nonsense')).toBe('other'); });
  it('limits distance fit for far pairs', () => { expect(calculateDistanceFit({ distance_miles: 20 }, { rawQuery: 'walkable date' }, { walking_preference_score: 90 })).toBeLessThan(10); });
  it('scores booking likelihood gracefully with missing data', () => { expect(calculateBookingLikelihood({}).booking_likelihood_score).toBeGreaterThanOrEqual(0); });
  it('lowers trust for missing profile fields', () => { expect(calculateBusinessQuality({ name: 'Only Name' }).missing_fields.length).toBeGreaterThan(0); });
  it('detects similar duplicate candidates without merging', () => { expect(calculateDuplicateConfidence({ name: 'Cafe Luna', address: '1 Main St' }, { name: 'Cafe Luna', address: '1 Main Street' })).toBeGreaterThan(40); });
  it('scores missing and duplicate photos', () => { expect(calculatePhotoQuality({}).needs_photo_repair).toBe(true); expect(calculatePhotoQuality({ primary_photo_url: 'logo.png', photos: ['logo.png'] }).duplicate_photo_risk_score).toBeGreaterThan(0); });
  it('prioritizes high-demand unclaimed owner leads', () => { const score = calculateOwnerLeadScore({ claim_status: 'unclaimed', views_30d: 100, saves_30d: 20, call_clicks_30d: 10, business_trust_score: 80 }); expect(assignLeadPriority(score)).toMatch(/high|urgent/); });
});
