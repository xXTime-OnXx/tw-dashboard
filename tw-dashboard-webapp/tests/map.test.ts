import { describe, expect, it } from 'vitest';
import { radiusZoom, villageMarkerRadius, villageStage } from '../apps/dashboard/src/map.tsx';

describe('world map marker sizing', () => {
  it('grows village markers with zoom while keeping useful limits', () => {
    expect(villageMarkerRadius(-1, false)).toBe(3);
    expect(villageMarkerRadius(2, false)).toBe(3);
    expect(villageMarkerRadius(4, false)).toBe(5);
    expect(villageMarkerRadius(7, false)).toBe(8);
    expect(villageMarkerRadius(7, true)).toBe(10);
  });

  it('uses all six documented village point appearances', () => {
    expect(
      [0, 299, 300, 999, 1_000, 2_999, 3_000, 8_999, 9_000, 10_999, 11_000].map(villageStage),
    ).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
  });

  it('fits a player radius into the available map height', () => {
    expect(radiusZoom(20, 550)).toBeGreaterThan(3);
    expect(radiusZoom(20, 550)).toBeLessThan(4);
    expect(radiusZoom(0, 550)).toBe(6);
  });
});
