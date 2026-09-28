// 1부(tier1) 전용 병행 대회. 리그 자체가 승점 하나로 축약돼 있으므로 챔스도
// 같은 방식 - 라운드마다 "내 팀 파워 vs 가상 상위권 클럽"을 applyVariance로
// 한 번씩 굴려서 이기면 다음 라운드, 지면 그 라운드 이름으로 탈락 처리한다.
// 상대 파워는 실측 없이 tier1 averageOVR(79~86) 위쪽으로 잡은 추정값이다.
// ponytail: 라운드 상대 세기는 튜닝값. tune-ladder처럼 실측하면 더 정확해진다.
import { applyVariance } from './team-power.mjs';

export const UCL_ROUNDS = [
  { id: 'ro16', label: '16강', opponentPower: 86 },
  { id: 'qf', label: '8강', opponentPower: 90 },
  { id: 'sf', label: '4강', opponentPower: 94 },
  { id: 'final', label: '결승', opponentPower: 98 },
];

export const UCL_RESULT_LABELS = {
  ro16: '16강 탈락', qf: '8강 탈락', sf: '4강 탈락', final: '준우승', champion: '우승',
};

export const UCL_REWARDS_FUNDS = { ro16: 100, qf: 250, sf: 500, final: 900, champion: 1500 };

export function simulateChampionsLeague(teamPower, rng = Math.random) {
  for (const round of UCL_ROUNDS) {
    const my = applyVariance(teamPower, undefined, rng);
    const opp = applyVariance(round.opponentPower, undefined, rng);
    if (my <= opp) return round.id;
  }
  return 'champion';
}
