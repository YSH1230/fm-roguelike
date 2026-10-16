import {
  XP_BASE_PER_CHUNK, XP_NEED_BASE, XP_NEED_STEP, XP_PER_APP, XP_PER_ASSIST, XP_PER_GOAL,
} from './constants.mjs';
import { capOf } from './player.mjs';
import { trainingMultipliers } from './coach.mjs';
import { facilityEffects } from './economy.mjs';

// 다음 레벨까지 필요한 XP: 레벨마다 조금씩 늘어난다.
export const xpNeeded = (level) => XP_NEED_BASE + XP_NEED_STEP * level;

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

// 천장에 닿지 않은 능력치가 하나라도 있는지(없으면 성장이 끝난 선수)
export const hasRoom = (p) => Object.keys(p.attrs).some((k) => p.attrs[k] < capOf(p, k));

// XP를 쌓고 레벨업마다 포인트 1개를 준다(성장이 끝난 선수는 레벨만 오른다). 올라간 레벨 수를 돌려준다.
export function addXp(p, amount) {
  p.xp += amount;
  let levelUps = 0;
  while (p.xp >= xpNeeded(p.xpLevel)) {
    p.xp -= xpNeeded(p.xpLevel);
    p.xpLevel += 1;
    levelUps += 1;
    if (hasRoom(p)) p.points = (p.points ?? 0) + 1;
  }
  return levelUps;
}

// 포인트 1개로 능력치 하나를 +1 올린다(천장까지).
export function spendPoint(p, key) {
  if (!(key in p.attrs)) throw new Error('없는 능력치입니다');
  if ((p.points ?? 0) < 1) throw new Error('쓸 수 있는 포인트가 없습니다');
  if (p.attrs[key] >= capOf(p, key)) throw new Error('이 능력치는 천장에 닿았습니다');
  p.attrs[key] += 1;
  p.points -= 1;
}

// 한 구간에서 얻는 XP. delta는 그 구간의 { apps, goals, assists }.
export function chunkXp(p, delta, { team, club }) {
  const raw = XP_BASE_PER_CHUNK + delta.apps * XP_PER_APP + delta.goals * XP_PER_GOAL + delta.assists * XP_PER_ASSIST;
  return raw * ageXpFactor(p.age) * facilityEffects(club).xpMultiplier * coachMul(team, p.position, 'xp');
}
