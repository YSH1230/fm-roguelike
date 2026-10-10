import { LEAGUE_POINTS_COEFFICIENT, BASE_POINTS_AT_LEAGUE_AVERAGE } from './constants.mjs';
import { clamp } from './chemistry.mjs';

const MAX_SEASON_POINTS = 38 * 3; // 38경기 승리 시 만점

export function convertPowerToPoints(
  teamPower,
  leagueAverageOVR,
  coefficient = LEAGUE_POINTS_COEFFICIENT,
  basePoints = BASE_POINTS_AT_LEAGUE_AVERAGE
) {
  const raw = basePoints + coefficient * (teamPower - leagueAverageOVR);
  return clamp(raw, 0, MAX_SEASON_POINTS);
}

// 스펙 2절 커리어 사다리. 5부에서 1부까지.
// 3부~1부의 averageOVR은 원래 5부->4부 간격(+9~10)을 그대로 이어붙인 추정값이었다.
// 그 값은 플레이어가 도달할 수 있는 전력을 확인하지 않고 만든 것이라, 2부부터
// 플레이어 전력이 리그 평균보다 낮아지고 1부는 승점 0으로 클램프돼 수학적으로
// 우승이 불가능했다. tools/tune-ladder.mjs로 2000판씩 재서 잡은 값이다.
// 아래 숫자는 시즌 자금 지급(스펙 2절: 지급 + 상한 30% 이월 + 승격 보너스)을
// 게임과 똑같이 맞춘 뒤 다시 측정한 것이다. 예전 측정은 지급만 있고 이월이
// 없던 시뮬레이터 기준이라 플레이어가 지금보다 조금 가난했다.
// 플레이어 베스트11 평균 OVR 실측(아래 리그 스쿼드를 물려받아 누적):
//   5부 69.8 / 4부 76.9 / 3부 83.9 / 2부 89.1 / 1부 92.3
// 5부와 4부는 이 계획 전부터 쓰던 기존 값이라 건드리지 않았다.
// 감독·스태프 요구(LEAGUE_EXPECTED_MANAGER), 시즌 자금 대폭 축소(리그별 지급표 330/480/800/1300/2000,
// 잔류 60%·승격 유지 70%, 이월 10%), 특수 태그 재설계를 넣은 뒤 아래 값을 다시 잡았다.
// tools/tune-ladder.mjs 1000판 실측(기본 봇: 5~3부 택티션 / 2~1부 레전더리, 수석 코치 프로 라이선스):
//   5부 우승  9.3 / 승격 20.3 / 안전 64.8 / 강등  5.6
//   4부 우승  5.8 / 승격 21.3 / 안전 66.5 / 강등  6.4
//   3부 우승  3.7 / 승격 16.6 / 안전 69.0 / 강등 10.7
//   2부 우승  4.1 / 승격 11.7 / 안전 63.5 / 강등 20.7
//   1부 우승  2.8 (승격 칸은 없음) / 안전 69.4 / 강등 18.8
// 태그 재설계(기본기 3종 + 보통·어려움 문턱 3/4/5, 수혜 포지션 보유자만 센다, 포메이션 8종·DMF) 후 재측정.
// 태그를 의도해서 모으는 플레이어가 상위 리그에서 앞서도록 3~1부 상대 평균을 올렸다(4부 +0.5 / 3부 +1.5 / 2부 +2.0 / 1부 +2.5).
// tools/sim-career.mjs 커리어 시뮬(5부 시작 → 1부 우승까지, 노화·계약·정체 해임 포함):
//   OVR만 보는 플레이(greedy 5000커리어): 1부 우승(런 승리) 2.7%, 3부 이상 시즌당 강등 8~14~16%
//   태그까지 아는 플레이(smart 420커리어): 1부 우승 14.0%, 챔피언스리그 진출 커리어 19%
//   (선수당 태그 보너스 smart 3부 3.4 / 2부 4.3 / 1부 4.4, greedy는 1.2 / 1.4 / 1.8)
// 사람처럼 플레이하는 봇(tools/sim-human.mjs: 판매 순환·감독/스태프 구매·보상·챔스 상금·스카우터/코치 활용)으로 재보정.
// 옛 값(5부 50 / 4부 54 / 3부 57 / 2부 66 / 1부 67)에서는 이 봇이 승격 직후 4부 전력 69, 3부 76, 2부 80, 1부 87로 들어오고
// 1부에서 몇 시즌 만에 전력 100까지 올라 1부 우승을 시즌의 56%나 했다. 반대로 52/58/63/69/74는 실플레이에서 5부 승격 비율 24%로 너무 빡빡했다.
// 지금 값(5부 50 / 4부 55 / 3부 60 / 2부 67 / 1부 75)은 하위 리그는 풀고 1부는 어렵게 둔 절충안이다.
// 감독 배율(택티션 1.07 / 레전더리 1.16 / GOD 1.26)과 리그 기대 감독(4부 1.02 / 3부 1.05 / 2부 1.09 / 1부 1.14)도 같이 키웠다. 210커리어 실측:
//   시즌당 승격(우승 포함) 5부 35% / 4부 47% / 3부 38% / 2부 38%, 강등 6% / 3% / 8% / 6% / 1부 12%, 1부 우승 17%, 1부 도달 30%.
// (리그 평균은 선수 OVR 평균이 아니라 감독 배율·조직력·코치가 곱해진 팀 전력과 비교하는 기준값이다.)
// tools/tune-ladder.mjs 2000판(OVR만 보는 봇):
//   5부 우승  9.0 / 승격 22.3 / 안전 63.1 / 강등  5.5
//   4부 우승  6.5 / 승격 17.4 / 안전 68.0 / 강등  8.1
//   3부 우승  2.4 / 승격 12.3 / 안전 70.5 / 강등 14.8
//   2부 우승  1.4 / 승격  8.2 / 안전 65.9 / 강등 24.6
//   1부 우승  0.8 (승격 칸은 없음) / 안전 65.8 / 강등 26.7
// 자금이 줄어 봇 전력이 5~8점 낮아져서 상대 평균(averageOVR)을 같은 만큼 내려 균형을 유지했다.
// 리그가 오를수록 승격 확률이 내려간다.
// v2(계약·대륙 폐지) 재조정: 대륙 시너지(+3)가 사라져 5부는 상대 평균을 낮추고, 재계약비가 없어져 돈이 남는 상위 리그는 올렸다.
// 시즌 자금 배율(FUNDS_SCALE)과 함께 tools/sim-human.mjs 300판으로 v1 결과(승점)에 맞췄다.
const LEAGUE_TIERS = {
  // 2000판 실측: 우승 22.3% / 승격 28.1% / 안전 47.1% / 강등 2.6%
  tier5: { label: '5부', averageOVR: [44, 52], safePoints: 38, targetPoints: 68, championPoints: 80 },
  // 2000판 실측: 우승 10.8% / 승격 22.7% / 안전 56.5% / 강등 9.9%
  tier4: { label: '4부', averageOVR: [51, 59], safePoints: 40, targetPoints: 73, championPoints: 86 },
  // 2000판 실측: 우승 8.8% / 승격 17.3% / 안전 54.6% / 강등 19.3%
  tier3: { label: '3부', averageOVR: [56, 64], safePoints: 42, targetPoints: 76, championPoints: 89 },
  // 2000판 실측: 우승 7.0% / 승격 11.8% / 안전 52.3% / 강등 28.8%
  tier2: { label: '2부', averageOVR: [62, 70], safePoints: 44, targetPoints: 79, championPoints: 91 },
  // 2000판 실측: 우승 4.3% / 승격 12.7% / 안전 49.5% / 강등 33.6%
  // 상위 4개 리그가 4부 우승률 10% 아래 좁은 띠에 몰려 있어서, 우승률 순서를
  // 지키면 1부는 4~5%가 상한이다. championPoints 88~89로는 1부 우승률이 2부와
  // 오차 범위 안에서 겹쳐(6.6% vs 5.9%) 순서가 판마다 뒤집혔다. 91로 벌렸다.
  tier1: { label: '1부', averageOVR: [69, 77], safePoints: 46, targetPoints: 82, championPoints: 95 },
};

// 낮은 리그부터. 사다리 순서는 엔진이 소유한다.
// (예전에는 ui/app.mjs가 자기 사본을 들고 있어서 리그를 늘릴 때 두 군데를 고쳐야 했다.)
export const LEAGUE_LADDER = ['tier5', 'tier4', 'tier3', 'tier2', 'tier1'];

export function getLeagueTier(tierId) {
  const tier = LEAGUE_TIERS[tierId];
  if (!tier) throw new Error(`Unknown league tier: ${tierId}`);
  return tier;
}

export function getLadderIndex(tierId) {
  const index = LEAGUE_LADDER.indexOf(tierId);
  if (index === -1) throw new Error(`Unknown league tier: ${tierId}`);
  return index;
}

export function getNextTier(tierId) {
  const index = getLadderIndex(tierId);
  return LEAGUE_LADDER[index + 1] ?? null;
}
