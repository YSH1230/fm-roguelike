// 영입 흥정. 카드에 보이는 건 상대 구단이 내놓은 "요구액"이고, 진짜 시세는 보이지 않는다.
// 구단은 태도(유연/보통/완강)와 인내심(유연 3·보통 2·완강 1번)을 가진다. 깎아 달라는 비율이 구단이 받아 줄 수 있는 폭(tolerance) 안이면 수락한다.
//   수락: 요구액 × (1 - 깎은 비율) >= 진짜 시세 × (1 - 폭)
// 거절하면 인내심이 1 줄고, 0이 되면 협상 결렬 - 그 카드는 다른 구단으로 가 버리고 그 구단 기분이 나빠진다(시즌 동안).
import { hash32 } from './scouting.mjs';

export const HAGGLE_DISCOUNTS = [0.1, 0.2, 0.3];
// 인내심은 태도와 같이 간다: 유연 3 / 보통 2 / 완강 1번(거절 횟수). 수치는 플레이와 시뮬로 조정한다.
export const patienceFor = (score) => (score >= 1 ? 3 : score <= -1 ? 1 : 2);
export const MOOD_MIN = -1;
export const MOOD_MAX = 1;

// 태도 점수(구단 성격 -1·0·+1 + 기분 -1~+1) -> 받아 줄 수 있는 깎임 폭의 범위. 수치는 플레이와 시뮬로 조정한다.
export const TOLERANCE_BY_SCORE = {
  '-2': [0, 0.04], '-1': [0, 0.08], '0': [0.02, 0.16], '1': [0.05, 0.26], '2': [0.1, 0.32],
};

export const attitudeScore = (base, mood = 0) => Math.max(-2, Math.min(2, base + mood));
export const attitudeLabel = (score) => (score >= 1 ? '유연' : score <= -1 ? '완강' : '보통');

// 구단마다 성격(-1·0·+1)이 고정된다(같은 런 안에서). seed는 런 번호.
export const clubBaseAttitude = (clubName, seed = '') => (hash32(`${seed}|${clubName}`) % 3) - 1;

// 카드마다 고정된 0~1 값(같은 카드로 다시 흥정해도 폭이 안 바뀌게)
export const cardUniform = (cardId, seed = '') => (hash32(`${seed}|${cardId}|tol`) + 0.5) / 4294967296;

export function toleranceFor(score, u) {
  const [lo, hi] = TOLERANCE_BY_SCORE[String(score)] ?? TOLERANCE_BY_SCORE['0'];
  return lo + (hi - lo) * u;
}

// 제안이 받아들여지는지. ask = 요구액(기준 가격), trueValue = 진짜 시세
export function offerAccepted({ ask, trueValue, discount, score, u }) {
  return ask * (1 - discount) >= trueValue * (1 - toleranceFor(score, u));
}

// 그 구단과의 거래 결과가 기분에 미치는 영향
export const moodAfter = (mood, event) => Math.max(MOOD_MIN, Math.min(MOOD_MAX, mood + (event === 'broken' ? -1 : event === 'asking' ? 1 : 0)));

// ---- 판매 협상: 구매 구단이 낸 오퍼에 "더 불러보기" ----
// 올려 달라는 비율(오퍼 대비). 구매자는 사는 쪽이라 파는 쪽 협상보다 폭이 절반이다(차익 방지).
export const COUNTER_RAISES = [0.05, 0.1, 0.15];
export const SALE_TOLERANCE_SCALE = 0.5;
// 구단의 태도 점수(유연할수록 후하다)와 카드별 고정값으로, 오퍼 대비 올려 달라는 비율을 받아 주는지
export function counterAccepted({ raise, score, u }) {
  return raise <= toleranceFor(score, u) * SALE_TOLERANCE_SCALE;
}

