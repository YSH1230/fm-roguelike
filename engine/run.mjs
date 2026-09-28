import { getLadderIndex, getNextTier } from './league.mjs';
import { MISSED_TARGET_LIMIT, REPUTATION_PER_TIER, REPUTATION_PER_TITLE, REPUTATION_PER_UCL_TITLE } from './constants.mjs';

// 시즌 하나가 끝났을 때 런이 계속되는지 판정한다.
// season.mjs와 가른 이유: 이 판정은 시즌 여러 개에 걸친 상태(누적 미달 횟수,
// 사다리 위치)를 봐야 해서 "이번 시즌 승점이 몇 점인가"와 입력이 다르다.
export function judgeRunOutcome({ seasonResult, leagueTierId, missedTargetCount }) {
  if (seasonResult === 'relegation') {
    return { ended: true, reason: 'relegation', canPromote: false };
  }
  const atTop = getNextTier(leagueTierId) === null;
  if (seasonResult === 'champion' && atTop) {
    return { ended: true, reason: 'victory', canPromote: false };
  }
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

// 스펙 10절. 도달 리그 단계는 사다리 인덱스+1로 센다(5부 도달 = 1단계).
export function computeReputation({ highestTierId, titles, uclTitles = 0 }) {
  return (getLadderIndex(highestTierId) + 1) * REPUTATION_PER_TIER
    + titles * REPUTATION_PER_TITLE
    + uclTitles * REPUTATION_PER_UCL_TITLE;
}
