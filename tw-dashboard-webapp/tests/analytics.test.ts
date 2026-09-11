import { describe, it, expect } from 'vitest';
import {
  nearby,
  delta,
  growth,
  baselineValid,
  fullCoverage,
} from '../packages/analytics/src/index.ts';
import {
  parseHourly,
  parseConquest,
  parseConfig,
  decode,
  sha,
} from '../apps/importer/src/parse.ts';
import { fixture } from './fixtures.ts';
import { gzipSync } from 'node:zlib';
describe('observations and parsing', () => {
  const group = fixture('2026-09-10T12:00:00Z');
  const bodies = () => new Map(group.objects.map((o) => [o.dataset, o.body]));
  it('decodes public names, preserves absent rankings and deduplicates radius matches', () => {
    const data = parseHourly(bodies());
    expect(data.players[1].name).toBe('Rival & Co');
    expect(data.players[4].attack).toBeNull();
    const result = nearby(
      data.villages,
      data.villages.filter((v) => v.owner === 1),
      20,
    );
    expect(result.get(2)).toEqual({ distance: 5, localVillages: 2 });
    expect(result.has(4)).toBe(true);
    expect(result.has(3)).toBe(false);
    expect(result.has(0)).toBe(false);
  });
  it('rejects incomplete groups and malformed CSV', () => {
    const b = bodies();
    b.delete('tribes');
    expect(() => parseHourly(b)).toThrow('Incomplete');
    b.set('tribes', Buffer.from('1,2'));
    expect(() => parseHourly(b)).toThrow();
  });
  it('rejects duplicate IDs and corrupt compression', () => {
    const b = bodies();
    b.set('players', Buffer.from('1,A,0,1,10,1\n1,B,0,1,10,1'));
    expect(() => parseHourly(b)).toThrow('Duplicate');
    expect(() => decode(Buffer.from([31, 139, 0]))).toThrow();
  });
  it('preserves integer precision and signed losses', () => {
    expect(delta('9007199254740993', '9007199254740994')).toBe('-1');
    expect(growth('100', '0')).toBeNull();
    expect(delta('1', null)).toBeNull();
  });
  it('requires bounded complete baselines', () => {
    expect(baselineValid('2026-09-10T10:00:00Z', new Date('2026-09-10T12:00:00Z'))).toBe(true);
    expect(baselineValid('2026-09-10T09:59:59Z', new Date('2026-09-10T12:00:00Z'))).toBe(false);
    expect(
      fullCoverage(
        ['2026-09-10T10:00:00Z', '2026-09-10T13:00:00Z'],
        '2026-09-10T10:00:00Z',
        '2026-09-10T13:00:00Z',
      ),
    ).toBe(false);
  });
  it('validates conquest IDs and refuses XML entities', () => {
    const e = {
      world: 'de999',
      village_id: 1,
      occurred_at: 1789041600,
      new_owner_id: 2,
      old_owner_id: 1,
      event_id: sha('de999:1:1789041600:2:1'),
    };
    expect(parseConquest(Buffer.from(JSON.stringify(e)))).toEqual(e);
    expect(() => parseConquest(Buffer.from(JSON.stringify({ ...e, event_id: 'wrong' })))).toThrow();
    expect(() =>
      parseConfig(gzipSync('<!DOCTYPE a [<!ENTITY b SYSTEM "file:///etc/passwd">]><a>&b;</a>')),
    ).toThrow();
  });
});
