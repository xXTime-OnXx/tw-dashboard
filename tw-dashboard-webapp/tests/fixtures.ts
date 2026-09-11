import { gzipSync } from 'node:zlib';
import { hourly } from '../apps/importer/src/parse.ts';
import type { Group } from '../apps/importer/src/import.ts';
export function fixture(at: string, points = 1000): Group {
  const datasets: Record<string, string> = {
    players: `1,Home,10,2,${points},1\n2,Rival+%26+Co,20,2,${points + 300},2\n3,Far+Away,0,1,800,3\n4,Boundary,0,1,500,4\n5,No+Ranking,0,1,400,5\n`,
    villages:
      '1,Home+A,500,500,1,500,1\n2,Home+B,505,500,1,500,2\n3,Rival+A,510,500,2,600,3\n4,Rival+B,511,500,2,600,4\n5,Far,700,700,3,800,5\n6,Boundary,525,500,4,500,6\n7,Barbarian,501,500,0,100,7\n8,Unknown,502,502,5,400,8\n',
    tribes: '10,Home+tribe,HME,1,2,1000,1000,1\n20,Rival+tribe,RVL,1,2,1300,1300,2\n',
  };
  for (const key of hourly.filter((s) => s.includes('kills')))
    datasets[key] = key.startsWith('player') ? `1,1,100\n2,2,${points}\n` : '1,10,100\n2,20,200\n';
  return {
    world: 'de999',
    at,
    kind: 'hourly',
    objects: hourly.map((dataset) => ({
      dataset,
      key: `fixture/${at}/${dataset}`,
      body: gzipSync(datasets[dataset]),
    })),
  };
}
