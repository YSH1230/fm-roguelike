import { ATTRIBUTES } from './constants.mjs';
import { gauss } from './rng.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 속성 평균(0~100)
export function overall(player) {
  const values = Object.values(player.attrs);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// 능력치 하나의 천장. 천장이 없는 옛 선수는 전체 잠재력 차이만큼 모두 더 오를 수 있다고 본다.
export function capOf(player, key) {
  if (player.caps?.[key] != null) return Math.max(player.caps[key], player.attrs[key]);
  return Math.min(99, player.attrs[key] + Math.max(0, (player.potential ?? 0) - overall(player)));
}

// 0.5 단위 별(0.5~5). 능력 10당 반 칸.
export function starsOf(value) {
  return clamp(Math.round(value / 10) / 2, 0.5, 5);
}

// 나이가 어릴수록 잠재력(성장 여지)이 크다. 33세부터는 0.
function growthRoom(age, rng) {
  if (age >= 33) return 0;
  return Math.round(Math.max(0, 33 - age) * 1.2 * rng());
}

// level: 목표 평균 능력(예: 60). 속성마다 ±6 정도 흔들린다.
export function createPlayer({ rng, id, position, age = 24, level = 60 }) {
  const attrs = {};
  const caps = {};
  for (const key of ATTRIBUTES[position]) {
    attrs[key] = Math.round(clamp(level + gauss(rng) * 6, 1, 99));
    caps[key] = clamp(attrs[key] + growthRoom(age, rng), attrs[key], 99);
  }
  const player = {
    id,
    position,
    age,
    attrs,
    caps,
    points: 0,
    xp: 0,
    xpLevel: 1,
    mood: 70,
    condition: 100,
    contract: { salary: 0, years: 3 },
    stats: { apps: 0, goals: 0, assists: 0 },
  };
  const now = overall(player);
  const capAvg = Object.values(caps).reduce((a, b) => a + b, 0) / Object.values(caps).length;
  player.potential = Math.round(clamp(capAvg, now, 99));
  return player;
}
