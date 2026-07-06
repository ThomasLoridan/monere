import { describe, it, expect } from 'vitest';
import {
  resolveStock,
  toYahooSymbol,
  isRealtimeSymbol,
  CORE_STOCKS,
  INDEX_DEFS,
} from './universe.js';

describe('universe resolution', () => {
  it('resolves canonical tickers and quoted symbols', () => {
    expect(resolveStock('MC')?.symbol).toBe('MC.PA');
    expect(resolveStock('MC.PA')?.ticker).toBe('MC');
    expect(resolveStock('aapl')?.name).toBe('Apple Inc.');
  });

  it('passes unknown symbols through to Yahoo unchanged', () => {
    expect(toYahooSymbol('ZZZZ')).toBe('ZZZZ');
    expect(toYahooSymbol('SAP')).toBe('SAP.DE');
  });

  it('flags EU venues as delayed and US as realtime', () => {
    expect(isRealtimeSymbol('AAPL')).toBe(true);
    expect(isRealtimeSymbol('MC')).toBe(false);
    expect(isRealtimeSymbol('AIR.PA')).toBe(false);
    // unknown suffix-less symbol assumed US
    expect(isRealtimeSymbol('PLTR')).toBe(true);
  });

  it('every core stock belongs to at least one known index', () => {
    const ids = new Set(INDEX_DEFS.map((d) => d.id));
    for (const s of CORE_STOCKS) {
      expect(s.indices.length).toBeGreaterThan(0);
      for (const i of s.indices) expect(ids.has(i)).toBe(true);
    }
  });
});
