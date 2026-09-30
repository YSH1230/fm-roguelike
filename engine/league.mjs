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
// 감독·스태프 요구(LEAGUE_EXPECTED_MANAGER)와 시즌 자금 감액(승격 첫 시즌 70%, 이월 20%,
// 리그 배수 1.35), 특수 태그 재설계(카드 20%, 역할 칸, 조커 +1)를 넣은 뒤 아래 값을 다시 잡았다.
// tools/tune-ladder.mjs 500판 실측(기본 봇: 5~3부 택티션 / 2~1부 레전더리, 수석 코치 프로 라이선스):
//   5부 우승  7.2 / 승격 21.8 / 안전 63.8 / 강등  7.2
//   4부 우승  9.2 / 승격 18.2 / 안전 64.6 / 강등  8.0
//   3부 우승  3.6 / 승격 12.2 / 안전 65.6 / 강등 18.6
//   2부 우승  3.8 / 승격  7.2 / 안전 66.0 / 강등 23.0
//   1부 우승  3.2 (승격 칸은 없음) / 안전 59.0 / 강등 27.8
// --rookie(감독·스태프를 안 사는 플레이)는 2부부터 강등 75%로 사실상 못 버틴다 - 의도한 압박이다.
// 리그가 오를수록 승격 확률이 내려가도록 승격/우승선을 올렸다.
const LEAGUE_TIERS = {
  // 2000판 실측: 우승 22.3% / 승격 28.1% / 안전 47.1% / 강등 2.6%
  tier5: { label: '5부', averageOVR: [48.6, 56.6], safePoints: 38, targetPoints: 68, championPoints: 80 },
  // 2000판 실측: 우승 10.8% / 승격 22.7% / 안전 56.5% / 강등 9.9%
  tier4: { label: '4부', averageOVR: [55.6, 62.6], safePoints: 40, targetPoints: 73, championPoints: 86 },
  // 2000판 실측: 우승 8.8% / 승격 17.3% / 안전 54.6% / 강등 19.3%
  tier3: { label: '3부', averageOVR: [61.3, 68.3], safePoints: 42, targetPoints: 76, championPoints: 89 },
  // 2000판 실측: 우승 7.0% / 승격 11.8% / 안전 52.3% / 강등 28.8%
  tier2: { label: '2부', averageOVR: [69.8, 76.8], safePoints: 44, targetPoints: 79, championPoints: 91 },
  // 2000판 실측: 우승 4.3% / 승격 12.7% / 안전 49.5% / 강등 33.6%
  // 상위 4개 리그가 4부 우승률 10% 아래 좁은 띠에 몰려 있어서, 우승률 순서를
  // 지키면 1부는 4~5%가 상한이다. championPoints 88~89로는 1부 우승률이 2부와
  // 오차 범위 안에서 겹쳐(6.6% vs 5.9%) 순서가 판마다 뒤집혔다. 91로 벌렸다.
  tier1: { label: '1부', averageOVR: [71.1, 78.1], safePoints: 46, targetPoints: 82, championPoints: 95 },
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
