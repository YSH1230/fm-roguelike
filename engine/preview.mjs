// v3: 반기 시작 직전 "시즌 전망". 시즌 중에는 팀 전력이 비밀이라, 기자 3명의 예상 순위와 이적시장 성적표로만 알려 준다.
import { getLeagueTier } from './league.mjs';

// 시즌 승점으로 예상 순위(1~20). 리그 기준선(우승·승격·잔류선)에 19팀 승점을 깔아 비교한다(잡음 없음).
export function rankFromPoints(points, tierId) {
  const tier = getLeagueTier(tierId);
  const anchors = [[1, tier.championPoints], [3, tier.targetPoints], [17, tier.safePoints], [20, tier.safePoints * 0.55]];
  const pointsAtRank = (rank) => {
    for (let i = 1; i < anchors.length; i++) {
      const [r0, p0] = anchors[i - 1];
      const [r1, p1] = anchors[i];
      if (rank <= r1) return p0 + ((rank - r0) / (r1 - r0)) * (p1 - p0);
    }
    return anchors.at(-1)[1];
  };
  let rank = 1;
  for (let i = 1; i <= 19; i++) if (pointsAtRank(i) > points) rank += 1;
  return rank;
}

const clampRank = (r) => Math.min(20, Math.max(1, Math.round(r)));

// 기자 3명의 예상: 분석가는 대체로 맞지만(±2) 가끔(15%) 크게 빗나가고, 낙관파는 +3위, 비관파는 -3위 쪽으로 쏠린다.
export function predictRanks(trueRank, rng = Math.random) {
  const wild = rng() < 0.15;
  const analystNoise = wild ? (rng() < 0.5 ? -1 : 1) * (5 + Math.floor(rng() * 4)) : Math.floor(rng() * 5) - 2;
  const jitter = () => Math.floor(rng() * 3) - 1;
  return {
    analyst: clampRank(trueRank + analystNoise),
    optimist: clampRank(trueRank - 3 + jitter()),
    pessimist: clampRank(trueRank + 3 + jitter()),
  };
}

// 이적시장 성적표: 영입 선수마다 "대중의 평판"(별·가격)으로 매긴 한 줄 평과 전체 등급. 숨은 값은 보지 않는다.
// entries: [{ name, delta(같은 자리 선발과의 별 차이), bargain(시세보다 싸게 샀는가) }]
export function marketReport(entries) {
  if (!entries.length) return { grade: '-', lines: [], summary: '이번 시장은 조용했습니다.' };
  const lines = entries.map((e) => ({
    name: e.name,
    text: e.delta >= 1 ? '기대 이상의 영입' : e.delta >= 0 ? '무난한 영입' : '고개를 갸웃하게 하는 영입',
    bargain: !!e.bargain,
  }));
  const avg = entries.reduce((s, e) => s + e.delta + (e.bargain ? 0.25 : 0), 0) / entries.length;
  const grade = avg >= 1 ? 'A' : avg >= 0.5 ? 'B' : avg >= 0 ? 'C' : 'D';
  const summary = { A: '이적시장의 승자라는 평가입니다.', B: '알찬 보강이라는 평가입니다.', C: '평범한 시장이었다는 평가입니다.', D: '의문이 남는 시장이라는 평가입니다.' }[grade];
  return { grade, lines, summary };
}
