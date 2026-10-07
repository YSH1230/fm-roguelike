import { getLadderIndex, getNextTier } from './league.mjs';
import {
  MISSED_TARGET_LIMIT, REPUTATION_PER_TIER, REPUTATION_PER_SEASON, REPUTATION_TITLE_BY_TIER,
  REPUTATION_UCL_BY_RESULT, REPUTATION_DOUBLE,
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
