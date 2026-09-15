import { fyLabel, fyStart, fyStartOfIso } from './fy';

describe('financial year', () => {
  it('starts on 1 April', () => {
    expect(fyStart(new Date(2026, 2, 31))).toBe(2025);
    expect(fyStart(new Date(2026, 3, 1))).toBe(2026);
  });

  it('reads the year from an ISO date', () => {
    expect(fyStartOfIso('2027-01-15')).toBe(2026);
    expect(fyStartOfIso('2026-04-01')).toBe(2026);
  });

  it('labels years as start-end', () => {
    expect(fyLabel(2026)).toBe('2026-27');
    expect(fyLabel(2099)).toBe('2099-00');
  });
});
