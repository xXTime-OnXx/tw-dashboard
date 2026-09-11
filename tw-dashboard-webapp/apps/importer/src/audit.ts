import { loadEnvFile } from 'node:process';
import { gunzipSync } from 'node:zlib';
import { Archive } from './r2.ts';
try {
  loadEnvFile('../tw-data-service/.env');
} catch {}
const archive = new Archive();
const world = process.argv[2] ?? 'de259';
if (!/^de\d+$/.test(world)) throw Error('Invalid world');
const manifest = await archive.json(`state/${world}/snapshots/latest.json`);
console.log(
  JSON.stringify({ world, captured_at: manifest.captured_at, datasets: manifest.snapshots.length }),
);
for (const s of manifest.snapshots) {
  const raw = await archive.get(s.key);
  const data = raw[0] === 31 ? gunzipSync(raw) : raw;
  const lines = data.toString().trim().split('\n');
  console.log(
    JSON.stringify({
      dataset: s.name,
      bytes: raw.length,
      rows: lines.length,
      columns: lines[0]?.split(',').length,
      samples: lines.slice(0, 2),
    }),
  );
}
let count = 0,
  bytes = 0,
  first: string | undefined,
  last: string | undefined;
for await (const o of archive.list(`snapshots/${world}/players/`)) {
  count++;
  bytes += o.size;
  first ??= o.key;
  last = o.key;
}
console.log(
  JSON.stringify({ playerSnapshotCount: count, compressedPlayerBytes: bytes, first, last }),
);
