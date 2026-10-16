import { DECLINE_AGE, MAX_AGE, RETIRE_CHANCE } from './constants.mjs';
import { overall } from './player.mjs';
import { randInt } from './rng.mjs';
import { setStars } from './roster.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 33~35세는 -1, 36세 이상은 -2씩 능력 2개가 줄어든다.
export const declineAmount = (age) => (age < DECLINE_AGE ? 0 : (age < 36 ? 1 : 2));

// 한 살 먹는다. 33세부터 하락하고 성장 여지(잠재력)는 현재 능력으로 맞춰진다.
export function ageUp(p, rng) {
  p.age += 1;
  const drop = declineAmount(p.age);
  if (drop > 0) {
    const keys = Object.keys(p.attrs);
    for (let i = 0; i < 2; i += 1) {
      const key = keys[randInt(rng, 0, keys.length - 1)];
      p.attrs[key] = clamp(p.attrs[key] - drop, 1, 99);
    }
    p.potential = Math.round(overall(p));
  }
}

// 나이별 은퇴 확률. 40세 이상은 강제(1).
export const retirementChance = (age) => (age >= MAX_AGE ? 1 : (RETIRE_CHANCE[age] ?? 0));
export const shouldRetire = (p, rng) => rng() < retirementChance(p.age);

// 내가 은퇴를 제안했을 때 선수의 대답: 33세 미만은 거절, 33~37세는 사기가 (50 + 8 x (나이 - 33)) 미만이면 수락, 38세부터는 수락.
export function evaluateRetireOffer(p) {
  if (p.age < DECLINE_AGE) return { accepted: false, reason: 'young' };
  if (p.age >= 38 || p.mood < 50 + (p.age - DECLINE_AGE) * 8) return { accepted: true, reason: null };
  return { accepted: false, reason: 'mood' };
}

// 은퇴시킨다: 스타 명단에서 빼고(명예의 전당 후보로) 선수를 돌려준다.
export function retire(team, rng, player) {
  if (!team.stars.includes(player)) throw new Error('이 팀의 스타가 아닙니다');
  setStars(team, rng, team.stars.filter((p) => p !== player));
  return player;
}

// 시즌이 끝날 때: 나이 +1과 하락, 컨디션 회복, 부상 완치, 사기가 70으로 20%씩 돌아옴, 확률 은퇴.
// 은퇴한 선수 목록을 돌려준다(계약 만료와 FA 처리는 계획 2의 tickContracts를 따로 부른다).
export function endOfSeason(team, rng) {
  for (const p of team.stars) {
    ageUp(p, rng);
    p.condition = 100;
    delete p.injury;
    p.resting = false;
    p.mood += (70 - p.mood) * 0.2;
  }
  const retired = team.stars.filter((p) => shouldRetire(p, rng));
  if (retired.length > 0) setStars(team, rng, team.stars.filter((p) => !retired.includes(p)));
  return retired;
}
