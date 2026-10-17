import { describe, expect, it } from 'vitest';
import { assessIndependentBusinessProfile } from '../independent-profile-gate';

const verified = {
  name: 'Example Bistro', address: '123 Main Street', city: 'Brooklyn', state: 'NY',
  latitude: 40.7, longitude: -73.9, sourceUrl: 'https://example.com',
  evidenceSource: 'official_website' as const, openStatus: 'open' as const,
};

describe('LI V2 photo-pending staging', () => {
  it('keeps the public publication gate closed for missing photos', () => {
    expect(assessIndependentBusinessProfile(verified).reasons).toContain('approved_photo_missing');
  });
  it('allows otherwise verified facts to be staged with an explicit exception', () => {
    expect(assessIndependentBusinessProfile(verified, { allowPhotoPending: true }).publishable).toBe(true);
  });
  it('never relaxes identity, coordinate, or operation checks', () => {
    const invalid = { ...verified, address: '', latitude: undefined, openStatus: 'unknown' as const };
    const verdict = assessIndependentBusinessProfile(invalid, { allowPhotoPending: true });
    expect(verdict.reasons).toContain('business_identity_incomplete');
    expect(verdict.reasons).toContain('coordinates_unverified');
    expect(verdict.reasons).toContain('operating_status_unverified');
  });
});
