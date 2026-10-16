import { NAME_POOLS, randomName } from '../data/name-pools.mjs';
import { createRng } from './rng.mjs';

const CONTINENTS = Object.keys(NAME_POOLS);

// 선수 id만으로 정해지는 이름. 저장할 필요 없이 언제 불러도 같은 이름이 나온다.
export function nameOf(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rng = createRng(h >>> 0);
  return randomName(CONTINENTS[Math.floor(rng() * CONTINENTS.length)], rng);
}
