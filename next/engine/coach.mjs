import { COACH_COST_FACTOR, CONTRACT_YEARS, INTENSITIES, RESIGN_MIN_MOOD, TRAITS } from './constants.mjs';
import { fillerLevel } from './team.mjs';
import { randInt } from './rng.mjs';
import { spend } from './economy.mjs';

export const COACH_KINDS = ['attack', 'defense'];
const TRAIT_KEYS = Object.keys(TRAITS);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 코치 한 명. stars는 0.5 단위(0.5~5)이고 팀 전력의 기본 레이팅이 된다(team.coaches[kind]가 이 객체다).
export function createCoach({ rng, id, kind, stars = 2, age }) {
  if (!COACH_KINDS.includes(kind)) throw new Error(`알 수 없는 코치 종류: ${kind}`);
  if (!(stars >= 0.5 && stars <= 5) || (stars * 2) % 1 !== 0) throw new Error('코치 별은 0.5 단위로 0.5~5여야 합니다');
  return {
    id,
    kind,
    stars,
    xp: 0,
    age: age ?? randInt(rng, 38, 60),
    mood: 70,
    trait: TRAIT_KEYS[randInt(rng, 0, TRAIT_KEYS.length - 1)],
    intensity: 'NORMAL',
    contract: { years: CONTRACT_YEARS },
  };
}

// 3년 계약 비용(코인, 한 번에 낸다): 1별 6, 3별 54, 5별 150
export const coachCost = (stars) => Math.round(COACH_COST_FACTOR * stars * stars);

// 고용 후보: 1~4별 사이 3명
export function generateCoachCandidates(rng, { kind, count = 3, prefix }) {
  return Array.from({ length: count }, (_, i) =>
    createCoach({ rng, id: `${prefix}-${i}`, kind, stars: randInt(rng, 2, 8) / 2 }));
}

export function setIntensity(coach, key) {
  if (!INTENSITIES[key]) throw new Error(`알 수 없는 훈련 강도: ${key}`);
  coach.intensity = key;
}

// 훈련 강도와 특성을 합친 배율. 계획 4(성장·상태)가 이 값을 쓴다.
export function trainingMultipliers(coach) {
  const i = INTENSITIES[coach.intensity];
  const t = TRAITS[coach.trait];
  return { xp: i.xp * t.xp, fatigue: i.fatigue, mood: i.mood + t.mood, injury: i.injury * t.injury };
}

export const coachXpNeeded = (stars) => 60 + stars * 40;

// XP를 쌓고 넘치면 별이 반 칸씩 오른다. 5별이면 더 오르지 않고 XP는 다음 별 직전에서 멈춘다.
export function addCoachXp(coach, amount) {
  coach.xp += amount;
  while (coach.stars < 5 && coach.xp >= coachXpNeeded(coach.stars)) {
    coach.xp -= coachXpNeeded(coach.stars);
    coach.stars += 0.5;
  }
  if (coach.stars >= 5) coach.xp = Math.min(coach.xp, coachXpNeeded(5) - 1);
}

// 시즌이 끝날 때 한 번: 승수와 나이, 특성에 따라 XP를 얻고 한 살 먹는다. 얻은 XP를 돌려준다.
export function coachSeasonGrowth(coach, rng, { wins }) {
  const youth = coach.age < 50 ? 1.2 : 1;
  const gain = Math.round((30 + wins * 1.5) * youth * TRAITS[coach.trait].xp * (0.8 + 0.4 * rng()));
  addCoachXp(coach, gain);
  coach.age += 1;
  return gain;
}

// 코치 수준이 바뀐 만큼 조연의 속성을 같이 올리고 내린다(기록은 그대로 둔다).
export function syncFillers(team) {
  const level = fillerLevel(team.coaches.attack.stars, team.coaches.defense.stars);
  const delta = level - team.fillerBase;
  if (delta !== 0) {
    for (const p of team.lineup.slice(team.stars.length)) {
      for (const key of Object.keys(p.attrs)) p.attrs[key] = clamp(Math.round(p.attrs[key] + delta), 1, 99);
    }
  }
  team.fillerBase = level;
}

// 새 코치를 고용한다: 비용을 내고(모자라면 아무것도 안 바뀐다) 팀 코치를 교체하고 조연을 맞춘다. 이전 코치를 돌려준다.
export function hireCoach(club, team, coach) {
  spend(club, coachCost(coach.stars));
  const previous = team.coaches[coach.kind];
  team.coaches[coach.kind] = coach;
  syncFillers(team);
  return previous;
}

// 계약 연수를 1 줄인다. 만료되면 true.
export function tickCoachContract(coach) {
  coach.contract.years -= 1;
  return coach.contract.years <= 0;
}

// 재계약: 사기가 40 미만이면 거절한다.
export function evaluateCoachRenewal(coach) {
  if (coach.mood < RESIGN_MIN_MOOD) return { accepted: false, reason: 'mood', cost: coachCost(coach.stars) };
  return { accepted: true, reason: null, cost: coachCost(coach.stars) };
}

export function renewCoach(club, coach) {
  const result = evaluateCoachRenewal(coach);
  if (!result.accepted) throw new Error(`코치 재계약 실패: ${result.reason}`);
  spend(club, result.cost);
  coach.contract.years = CONTRACT_YEARS;
}
