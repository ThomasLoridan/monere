import { describe, it, expect } from 'vitest';
import { beatStats } from './provider.js';

describe('beatStats — derived transparently from real surprise history', () => {
  it('computes beat rate and average surprise', () => {
    const stats = beatStats([
      {
        period: '2026-03-31',
        quarter: 'Q1 2026',
        epsActual: 2.4,
        epsEstimate: 2.2,
        surprisePct: 9.1,
      },
      {
        period: '2025-12-31',
        quarter: 'Q4 2025',
        epsActual: 1.9,
        epsEstimate: 2.0,
        surprisePct: -5.0,
      },
      {
        period: '2025-09-30',
        quarter: 'Q3 2025',
        epsActual: 2.1,
        epsEstimate: 1.9,
        surprisePct: 10.5,
      },
      {
        period: '2025-06-30',
        quarter: 'Q2 2025',
        epsActual: 2.0,
        epsEstimate: 1.8,
        surprisePct: 11.1,
      },
    ]);
    expect(stats.quarters).toBe(4);
    expect(stats.beats).toBe(3);
    expect(stats.misses).toBe(1);
    expect(stats.beatRatePct).toBe(75);
    expect(stats.tendency).toBe('beat');
    expect(stats.avgSurprisePct).toBeCloseTo(6.4, 1);
  });

  it('returns nulls (not invented values) when history is empty', () => {
    const stats = beatStats([]);
    expect(stats.beatRatePct).toBeNull();
    expect(stats.avgSurprisePct).toBeNull();
    expect(stats.tendency).toBeNull();
  });

  it('classifies balanced history as inline', () => {
    const rows = [
      { period: 'a', quarter: 'a', epsActual: 2, epsEstimate: 1.9, surprisePct: 5 },
      { period: 'b', quarter: 'b', epsActual: 1.8, epsEstimate: 2, surprisePct: -10 },
    ];
    expect(beatStats(rows).tendency).toBe('inline');
  });
});
