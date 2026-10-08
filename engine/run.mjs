import { getLadderIndex, getNextTier } from './league.mjs';
import {
  MISSED_TARGET_LIMIT, REPUTATION_PER_TIER, REPUTATION_PER_SEASON, REPUTATION_TITLE_BY_TIER,
  REPUTATION_UCL_BY_RESULT, REPUTATION_DOUBLE,
  PRESTIGE_TIER_BASE, PRESTIGE_RESULT_MULT, PRESTIGE_SURPLUS_RATE, PRESTIGE_DEMAND, PRESTIGE_COMBO_STEP, PRESTIGE_COMBO_MAX,
  PRESTIGE_TITLE_STREAK, PRESTIGE_UCL, PRESTIGE_DOUBLE, PRESTIGE_RETIRE, PRESTIGE_GRADES, PRESTIGE_TITLES,
} from './constants.mjs';

// 시즌 하나가 끝났을 때 런이 계속되는지 판정한다.
// season.mjs와 가른 이유: 이 판정은 시즌 여러 개에 걸친 상태(누적 미달 횟수,
// 사다리 위치)를 봐야 해서 "이번 시즌 승점이 몇 점인가"와 입력이 다르다.
export function judgeRunOutcome({ seasonResult, leagueTierId, missedTargetCount }) {
  if (seasonResult === 'relegation') {
    return { ended: true, reason: 'relegation', canPromote: false };
  }
  const atTop = getNextTier(leagueTierId) === null;
  // 1부 우승은 런을 끝내지 않는다 - 계속 도전하거나 플레이어가 직접 은퇴한다(ui renderRunEnd 'victory').
  if (missedTargetCount >= MISSED_TARGET_LIMIT) {
    return { ended: true, reason: 'missedTargets', canPromote: false };
  }
  const reached = seasonResult === 'promotion' || seasonResult === 'champion';
  return { ended: false, reason: null, canPromote: reached && !atTop };
}

// 목표선을 넘으면 누적이 초기화된다. 해임 시즌은 런이 이미 끝났으므로 건드리지 않는다.
export function nextMissedTargetCount(seasonResult, current) {
  if (seasonResult === 'relegation') return current;
  if (seasonResult === 'promotion' || seasonResult === 'champion') return 0;
  return current + 1;
}

// 명예 점수 내역. stats = { highestTierId, seasons, titlesByTier, streakPoints, uclResults, doubles }.
// 도달 리그 단계는 사다리 인덱스+1로 센다(5부 도달 = 1단계).
export function reputationBreakdown({ highestTierId, seasons = 0, titlesByTier = {}, streakPoints = 0, uclResults = {}, doubles = 0 }) {
  const rows = [
    { id: 'tier', label: '도달 리그', value: (getLadderIndex(highestTierId) + 1) * REPUTATION_PER_TIER },
    { id: 'seasons', label: '버틴 시즌', value: seasons * REPUTATION_PER_SEASON },
    { id: 'titles', label: '리그 우승', value: Object.entries(titlesByTier).reduce((sum, [tier, n]) => sum + n * (REPUTATION_TITLE_BY_TIER[tier] ?? 0), 0) },
    { id: 'streak', label: '연속 우승 보너스', value: streakPoints },
    { id: 'ucl', label: '챔피언스리그', value: Object.entries(uclResults).reduce((sum, [result, n]) => sum + n * (REPUTATION_UCL_BY_RESULT[result] ?? 0), 0) },
    { id: 'double', label: '더블', value: doubles * REPUTATION_DOUBLE },
  ];
  return rows;
}

export function computeReputation(stats) {
  return reputationBreakdown(stats).reduce((sum, row) => sum + row.value, 0);
}

// ---------- 명성 점수(Prestige) ----------
// 시즌 하나가 끝났을 때 얻는 점수. 연속 기록(콤보)은 호출하는 쪽이 들고 있다가 다음 호출에 넘긴다.
//   result: 'champion' | 'promotion' | 'safe'(잔류) | 'relegation'(강등 = 런 종료, 이 시즌 점수 없음)
//   combo: 지금까지 연속 승격·우승 횟수, titleStreak: 지금까지 연속 리그 우승 횟수(둘 다 이 시즌 이전)
export function seasonPrestige({ tierId, result, points = 0, safePoints = 0, combo = 0, titleStreak = 0 }) {
  const mult = PRESTIGE_RESULT_MULT[result] ?? 0;
  const success = result === 'promotion' || result === 'champion';
  const nextCombo = success ? combo + 1 : 0;
  const nextTitleStreak = result === 'champion' ? titleStreak + 1 : 0;
  const rows = [];
  const add = (id, label, value) => { if (value > 0) rows.push({ id, label, value }); };
  add('league', '리그 성적', (PRESTIGE_TIER_BASE[tierId] ?? 0) * mult);
  if (mult > 0) add('surplus', '안전 승점 초과', Math.round(Math.max(0, points - safePoints) * PRESTIGE_SURPLUS_RATE));
  add('combo', `${nextCombo}연속 성공`, nextCombo >= 2 ? Math.min(PRESTIGE_COMBO_MAX, (nextCombo - 1) * PRESTIGE_COMBO_STEP) : 0);
  add('streak', `${nextTitleStreak}연속 우승`, nextTitleStreak >= 2 ? PRESTIGE_TITLE_STREAK : 0);
  return { rows, total: rows.reduce((s, r) => s + r.value, 0), combo: nextCombo, titleStreak: nextTitleStreak };
}

export function demandPrestige(difficulty) {
  const value = PRESTIGE_DEMAND[difficulty] ?? 0;
  return value > 0 ? [{ id: 'demand', label: '이사진 요구 달성', value }] : [];
}

// 챔피언스리그 결과 + (같은 시즌 리그 우승이면) 더블
export function uclPrestige(uclResult, { alsoLeagueChampion = false } = {}) {
  const rows = [];
  const base = PRESTIGE_UCL[uclResult] ?? 0;
  if (base > 0) rows.push({ id: 'ucl', label: '챔피언스리그', value: base });
  if (uclResult === 'champion' && alsoLeagueChampion) rows.push({ id: 'double', label: '더블', value: PRESTIGE_DOUBLE });
  return rows;
}

export const retirePrestige = () => [{ id: 'retire', label: '커리어 완결', value: PRESTIGE_RETIRE }];

// 한 런의 점수 등급
export function gradeOf(score) {
  return PRESTIGE_GRADES.find((g) => score >= g.min)?.id ?? 'D';
}

// 커리어 누적 점수 → 칭호와 다음 칭호까지의 진행도
export function titleProgress(careerScore) {
  let idx = 0;
  PRESTIGE_TITLES.forEach((t, i) => { if (careerScore >= t.min) idx = i; });
  const cur = PRESTIGE_TITLES[idx];
  const next = PRESTIGE_TITLES[idx + 1] ?? null;
  return {
    title: cur.label, index: idx, next: next?.label ?? null, nextMin: next?.min ?? null,
    progress: next ? (careerScore - cur.min) / (next.min - cur.min) : 1,
    remaining: next ? next.min - careerScore : 0,
  };
}
