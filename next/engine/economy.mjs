import {
  CAP_COST_FIRST, CAP_COST_STEP, CAP_EXPANSIONS_MAX, CAP_STEP, CHAMPION_PRIZE, FACILITY_COST_FIRST, FACILITY_KINDS, FACILITY_MAX,
  FAN_INCOME_SCALE, FAN_PER_RESULT, SALARY_CAP, START_COINS, START_FANS, WIN_INCOME,
} from './constants.mjs';
import { payroll } from './contract.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 구단 상태: 코인 하나, 팬 지수, 시설 3종(각 1~10단계), 캡 확장 횟수.
export const createClub = ({ coins = START_COINS, fans = START_FANS } = {}) => ({
  coins,
  fans,
  facilities: { stadium: 1, training: 1, rehab: 1 },
  capLevel: 0,
});

export function earn(club, amount) {
  if (!(amount >= 0)) throw new Error('수입은 0 이상이어야 합니다');
  club.coins += amount;
}

// 모자라면 아무것도 바꾸지 않고 오류를 낸다.
export function spend(club, amount) {
  if (!(amount >= 0)) throw new Error('지출은 0 이상이어야 합니다');
  if (amount > club.coins) throw new Error('코인이 모자랍니다');
  club.coins -= amount;
}

function checkKind(kind) {
  if (!FACILITY_KINDS.includes(kind)) throw new Error(`알 수 없는 시설: ${kind}`);
}

export function upgradeCost(club, kind) {
  checkKind(kind);
  const n = club.facilities[kind]; // 지금 1단계면 이번이 1번째 올리기
  return FACILITY_COST_FIRST + 4 * (n - 1) + (n - 1) ** 2;
}

export function upgradeFacility(club, kind) {
  checkKind(kind);
  if (club.facilities[kind] >= FACILITY_MAX) throw new Error('이미 최고 단계입니다');
  spend(club, upgradeCost(club, kind));
  club.facilities[kind] += 1;
}

export const capExpandCost = (club) => CAP_COST_FIRST + club.capLevel * CAP_COST_STEP;

export function expandCap(club) {
  if (club.capLevel >= CAP_EXPANSIONS_MAX) throw new Error('캡을 더 늘릴 수 없습니다');
  spend(club, capExpandCost(club));
  club.capLevel += 1;
}

// tier: 3(3부) 2(2부) 1(1부)
export function salaryCap(club, tier) {
  if (SALARY_CAP[tier] === undefined) throw new Error(`알 수 없는 리그 단계: ${tier}`);
  return SALARY_CAP[tier] + club.capLevel * CAP_STEP;
}

// 구간 하나의 수입: 승리마다 리그 단계 수입, 홈경기마다 팬 수입. 무승부·패배는 승리 수입이 없다.
export function chunkIncome(results, teamId, club, tier) {
  let win = 0;
  let fan = 0;
  for (const r of results) {
    const home = r.homeId === teamId;
    if (!home && r.awayId !== teamId) continue;
    const mine = home ? r.homeGoals : r.awayGoals;
    const theirs = home ? r.awayGoals : r.homeGoals;
    if (mine > theirs) win += WIN_INCOME[tier];
    if (home) fan += club.facilities.stadium * (club.fans / 100) * FAN_INCOME_SCALE;
  }
  fan = Math.round(fan);
  return { win, fan, total: win + fan };
}

// 구간 성적에 따라 팬 지수가 움직인다(0~100).
export function fansAfterChunk(fans, results, teamId) {
  let delta = 0;
  for (const r of results) {
    const home = r.homeId === teamId;
    if (!home && r.awayId !== teamId) continue;
    const diff = (home ? 1 : -1) * (r.homeGoals - r.awayGoals);
    delta += Math.sign(diff) * FAN_PER_RESULT;
  }
  return clamp(fans + delta, 0, 100);
}

export const seasonPrize = (tier, champion) => (champion ? CHAMPION_PRIZE[tier] : 0);

// 시설이 다른 계획에 주는 효과(훈련은 XP 배율, 재활은 회복 배율).
export const facilityEffects = (club) => ({
  xpMultiplier: 1 + 0.08 * (club.facilities.training - 1),
  healMultiplier: 1 + 0.1 * (club.facilities.rehab - 1),
});

// FA 협상(계획 2의 evaluateOffer)에 넘기는 club 객체. 시설 값은 세 시설 단계의 평균(내림).
export function negotiationClub(club, { rank, morale, team, tier }) {
  const levels = Object.values(club.facilities);
  return {
    rank,
    facility: Math.floor(levels.reduce((a, b) => a + b, 0) / levels.length),
    fans: Math.round(club.fans),
    morale,
    capRoom: salaryCap(club, tier) - payroll(team),
  };
}
