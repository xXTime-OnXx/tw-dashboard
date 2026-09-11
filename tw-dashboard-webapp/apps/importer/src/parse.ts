import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Player, Village, Tribe, Conquest } from '../../../packages/contracts/src/index.ts';
export const hourly = [
  'players',
  'villages',
  'tribes',
  'player-kills-attack',
  'player-kills-defense',
  'player-kills-support',
  'player-kills-all',
  'tribe-kills-attack',
  'tribe-kills-defense',
  'tribe-kills-all',
];
export const configurations = ['world-config', 'unit-info', 'building-info'];
export const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
export function decode(body: Buffer) {
  return (
    body[0] === 0x1f && body[1] === 0x8b
      ? gunzipSync(body, { maxOutputLength: 128 * 1024 * 1024 })
      : body
  ).toString('utf8');
}
const num = (v: string) => {
  if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) > 2147483647)
    throw Error('Invalid integer');
  return Number(v);
};
const counter = (v: string) => {
  if (!/^\d+$/.test(v) || BigInt(v) > 9223372036854775807n) throw Error('Invalid counter');
  return BigInt(v).toString();
};
const name = (v: string) => decodeURIComponent(v.replace(/\+/g, ' '));
function rows(body: Buffer, columns: number) {
  const result = parse(decode(body), {
    skip_empty_lines: true,
    relax_column_count: false,
  }) as string[][];
  if (result.some((r) => r.length !== columns)) throw Error(`Expected ${columns} columns`);
  return result;
}
function unique<T>(items: T[], key: (x: T) => number) {
  const ids = new Set<number>();
  for (const item of items) {
    const id = key(item);
    if (ids.has(id)) throw Error('Duplicate entity ID');
    ids.add(id);
  }
  return items;
}
export function parseHourly(bodies: Map<string, Buffer>) {
  if (hourly.some((d) => !bodies.has(d))) throw Error('Incomplete hourly group');
  const players: Player[] = unique(
    rows(bodies.get('players')!, 6).map((r) => ({
      id: num(r[0]),
      name: name(r[1]),
      tribe: num(r[2]),
      villages: num(r[3]),
      points: counter(r[4]),
      rank: num(r[5]),
      attack: null,
      defense: null,
      support: null,
      all: null,
    })),
    (p) => p.id,
  );
  const villages: Village[] = unique(
    rows(bodies.get('villages')!, 7).map((r) => {
      const x = num(r[2]),
        y = num(r[3]);
      if (x > 999 || y > 999) throw Error('Invalid coordinates');
      return {
        id: num(r[0]),
        name: name(r[1]),
        x,
        y,
        owner: num(r[4]),
        points: counter(r[5]),
        rank: num(r[6]),
      };
    }),
    (v) => v.id,
  );
  const tribes: Tribe[] = unique(
    rows(bodies.get('tribes')!, 8).map((r) => ({
      id: num(r[0]),
      name: name(r[1]),
      tag: name(r[2]),
      members: num(r[3]),
      villages: num(r[4]),
      points: counter(r[5]),
      allPoints: counter(r[6]),
      rank: num(r[7]),
      attack: null,
      defense: null,
      all: null,
    })),
    (t) => t.id,
  );
  const orphanRankings: { dataset: string; id: number; rank: number; value: string }[] = [];
  for (const dataset of hourly.filter((d) => d.includes('-kills-'))) {
    const entities = new Map<number, Player | Tribe>(
      (dataset.startsWith('player') ? players : tribes).map((p) => [p.id, p]),
    );
    const metric = dataset.split('-').at(-1)!;
    const ids = new Set<number>();
    for (const r of rows(bodies.get(dataset)!, 3)) {
      const rank = num(r[0]),
        id = num(r[1]),
        value = counter(r[2]);
      if (ids.has(id)) throw Error('Duplicate ranking ID');
      ids.add(id);
      const entity = entities.get(id);
      if (entity) (entity as unknown as Record<string, unknown>)[metric] = value;
      else orphanRankings.push({ dataset, id, rank, value });
    }
  }
  if (!players.length || !villages.length) throw Error('Empty world snapshot');
  return { players, villages, tribes, orphanRankings };
}
export function parseConfig(body: Buffer) {
  const xml = decode(body);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('XML entities forbidden');
  if (XMLValidator.validate(xml) !== true) throw Error('Invalid XML');
  return new XMLParser({ ignoreAttributes: false, processEntities: false }).parse(xml);
}
export function parseConquest(body: Buffer): Conquest {
  const e = JSON.parse(body.toString());
  if (!/^de\d+$/.test(e.world)) throw Error('Invalid world');
  for (const k of ['village_id', 'new_owner_id', 'old_owner_id', 'occurred_at']) num(String(e[k]));
  const id = sha(`${e.world}:${e.village_id}:${e.occurred_at}:${e.new_owner_id}:${e.old_owner_id}`);
  if (e.event_id !== id) throw Error('Invalid event ID');
  return e;
}
export function keyInfo(key: string) {
  const m =
    /^snapshots\/(de\d+)\/([a-z-]+)\/date=(\d{4}-\d{2}-\d{2})\/hour=(\d{2})\/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.gz$/.exec(
      key,
    );
  if (!m) return null;
  const at = `${m[5]}-${m[6]}-${m[7]}T${m[8]}:${m[9]}:${m[10]}Z`;
  if (at.slice(0, 10) !== m[3] || at.slice(11, 13) !== m[4] || !Number.isFinite(+new Date(at)))
    throw Error('Invalid snapshot key date');
  return { world: m[1], dataset: m[2], at: new Date(at).toISOString() };
}
