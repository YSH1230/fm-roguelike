import {
  XP_BASE_PER_CHUNK, XP_PER_APP, XP_PER_ASSIST, XP_PER_GOAL,
} from './constants.mjs';
import { overall } from './player.mjs';
import { randInt } from './rng.mjs';
import { trainingMultipliers } from './coach.mjs';
import { facilityEffects } from './economy.mjs';

// 다음 레벨까지 필요한 XP: 레벨 1은 50, 레벨마다 10씩 늘어난다.
export const xpNeeded = (level) => 40 + 10 * level;

// 어릴수록 XP 효율이 좋다.
export function ageXpFactor(age) {
  if (age <= 21) return 1.3;
  if (age <= 25) return 1.15;
  if (age <= 29) return 1;
  if (age <= 32) return 0.8;
  return 0.5;
}

// 선수 포지션에 맞는 코치 배율(공격수는 공격 코치, 수비수·골키퍼는 수비 코치, 미드는 평균).
// 특성·강도가 없는 단순 코치(별만 있는 객체)는 배율 1로 본다. key: xp | fatigue | mood | injury
export function coachMul(team, position, key) {
  const of = (c) => (c.trait ? trainingMultipliers(c)[key] : (key === 'mood' ? 0 : 1));
  const { attack, defense } = team.coaches;
  if (position === 'FW') return of(attack);
  if (position === 'DF' || position === 'GK') return of(defense);
  return (of(attack) + of(defense)) / 2;
}

// 능력이 잠재력보다 낮을 때만 능력 2개가 +1~2 오른다(99 상한).
export function raiseAttrs(p, rng) {
  const keys = Object.keys(p.attrs);
  let gained = 0;
  for (let i = 0; i < 2 && overall(p) < p.potential; i += 1) {
    const key = keys[randInt(rng, 0, keys.length - 1)];
    const next = Math.min(99, p.attrs[key] + randInt(rng, 1, 2));
    gained += next - p.attrs[key];
    p.attrs[key] = next;
  }
  return gained;
}

// XP를 쌓고 레벨업마다 능력을 올린다. 올라간 레벨 수를 돌려준다.
export function addXp(p, amount, rng) {
  p.xp += amount;
  let levelUps = 0;
  while (p.xp >= xpNeeded(p.xpLevel)) {
    p.xp -= xpNeeded(p.xpLevel);
    p.xpLevel += 1;
    levelUps += 1;
    raiseAttrs(p, rng);
  }
  return levelUps;
}

// 한 구간에서 얻는 XP. delta는 그 구간의 { apps, goals, assists }.
export function chunkXp(p, delta, { team, club }) {
  const raw = XP_BASE_PER_CHUNK + delta.apps * XP_PER_APP + delta.goals * XP_PER_GOAL + delta.assists * XP_PER_ASSIST;
  return raw * ageXpFactor(p.age) * facilityEffects(club).xpMultiplier * coachMul(team, p.position, 'xp');
}
