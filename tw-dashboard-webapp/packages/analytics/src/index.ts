import type { Village, Player, Evidence } from '../../contracts/src/index.ts';
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function nearby(villages: Village[], anchors: Village[], radius: number) {
  const result = new Map<number, { distance: number; localVillages: number }>();
  for (const v of villages) {
    if (!v.owner) continue;
    const d = Math.min(...anchors.map((a) => distance(a, v)));
    if (d <= radius) {
      const p = result.get(v.owner);
      result.set(v.owner, {
        distance: Math.min(p?.distance ?? Infinity, d),
        localVillages: (p?.localVillages ?? 0) + 1,
      });
    }
  }
  return result;
}
export const delta = (current: string | null, baseline: string | null) =>
  current === null || baseline === null ? null : (BigInt(current) - BigInt(baseline)).toString();
export function growth(current: string | null, baseline: string | null) {
  if (current === null || baseline === null || BigInt(baseline) === 0n) return null;
  return Number(((BigInt(current) - BigInt(baseline)) * 1000000n) / BigInt(baseline)) / 10000;
}
export function baselineValid(baseline: string | null, target: Date) {
  return (
    baseline !== null && +new Date(baseline) <= +target && +target - +new Date(baseline) <= 7200000
  );
}
export function simpleEvidence(
  current: Player,
  baseline: Player | null,
  perspectiveGrowth: number | null,
  from: string,
  to: string,
): Evidence[] {
  if (!baseline) return [];
  const flags: Evidence[] = [];
  const add = (kind: string, label: string, detail: string) =>
    flags.push({ kind, label, detail, from, to, sourceIds: [from, to] });
  const attack = delta(current.attack, baseline.attack);
  if (attack !== null && BigInt(attack) > 0n)
    add('offensive-growth', 'Offensive growth', `+${attack} offensive bashpoints world-wide.`);
  const rate = growth(current.points, baseline.points);
  if (rate !== null && perspectiveGrowth !== null && rate > perspectiveGrowth)
    add(
      'faster-growth',
      'Faster growth',
      `${rate.toFixed(2)}% points growth versus ${perspectiveGrowth.toFixed(2)}% for the perspective player.`,
    );
  return flags;
}
export function fullCoverage(times: string[], from: string, to: string) {
  const stamps = [...new Set(times.map((t) => +new Date(t)))].sort((a, b) => a - b);
  if (!stamps.length || stamps[0] > +new Date(from) || stamps.at(-1)! < +new Date(to)) return false;
  return stamps.every((n, i) => !i || n - stamps[i - 1] <= 7200000);
}

export function intervalsCover(
  intervals: { from: string; to: string }[],
  from: string,
  to: string,
) {
  let covered = +new Date(from);
  for (const interval of [...intervals].sort((a, b) => Date.parse(a.from) - Date.parse(b.from))) {
    if (Date.parse(interval.from) > covered) break;
    covered = Math.max(covered, Date.parse(interval.to));
    if (covered >= Date.parse(to)) return true;
  }
  return false;
}
