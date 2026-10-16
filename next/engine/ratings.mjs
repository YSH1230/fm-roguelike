import { COACH_BASE_PER_STAR, STAR_MAX_BONUS } from './constants.mjs';

const avg = (p, keys) => keys.reduce((sum, k) => sum + p.attrs[k], 0) / keys.length;

// 이 선수가 공격력에 기여하는 능력값(0이면 공격에 기여하지 않는 포지션)
export function attackValue(p) {
  if (p.position === 'FW') return avg(p, ['shooting', 'pace', 'dribbling']);
  if (p.position === 'MF') return avg(p, ['passing', 'vision']);
  return 0;
}

// 수비력에 기여하는 능력값
export function defenseValue(p) {
  if (p.position === 'DF') return avg(p, ['tackling', 'marking', 'heading']);
  if (p.position === 'GK') return avg(p, ['reflexes', 'handling', 'positioning']);
  if (p.position === 'MF') return avg(p, ['workrate', 'stamina']);
  return 0;
}

// 사기·컨디션이 기여를 보정한다(사기 0~100 → 0.85~1.15, 컨디션 0~100 → 0.8~1.0).
export function modifier(p) {
  return (0.85 + (0.3 * p.mood) / 100) * (0.8 + (0.2 * p.condition) / 100);
}

// 능력 30 미만은 0점, 100이면 STAR_MAX_BONUS점.
function bonus(value, p) {
  return Math.max(0, (value - 30) / 70) * STAR_MAX_BONUS * modifier(p);
}

// 코치(공격·수비)가 기본 레이팅을 정하고, 스타가 그 위에 더해진다.
export function teamRatings({ coaches, stars }) {
  let attack = coaches.attack.stars * COACH_BASE_PER_STAR;
  let defense = coaches.defense.stars * COACH_BASE_PER_STAR;
  for (const p of stars) {
    const a = attackValue(p);
    const d = defenseValue(p);
    if (a > 0) attack += bonus(a, p);
    if (d > 0) defense += bonus(d, p);
  }
  return { attack, defense };
}
