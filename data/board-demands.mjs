// 이사진 요구 카드(선택형 보너스). 달성하면 다음 시즌 자금 보너스, 못 해도 페널티 없음.
// check(s, param)의 s = { lineup, chemistry, track, firstHalfPoints, grant, goal }
//   track = { spent(이번 시즌 영입 지출), winterTransactions(겨울 시장 거래 수) }
// tags는 구단 색채가 카드 추첨을 편향시키는 데 쓴다(club.demandBias).
const avg = (xs, f) => (xs.length ? xs.reduce((n, x) => n + f(x), 0) / xs.length : 0);

export const DEMAND_CARDS = [
  { id: 'youth1', difficulty: 'easy', tags: ['youth'], text: '선발 중 유스 출신 1명 이상',
    check: (s) => s.lineup.filter((p) => p.isDraftedYouth).length >= 1 },
  { id: 'chem50', difficulty: 'easy', tags: ['stable'], text: '시즌 종료 때 적응도 50 이상',
    check: (s) => s.chemistry >= 50 },
  { id: 'spend80', difficulty: 'easy', tags: ['spend'], text: '영입 지출을 시즌 자금의 80% 이하로',
    check: (s) => s.track.spent <= s.grant * 0.8 },

  { id: 'youth3', difficulty: 'normal', tags: ['youth'], text: '선발 중 유스 출신 3명 이상',
    check: (s) => s.lineup.filter((p) => p.isDraftedYouth).length >= 3 },
  { id: 'age26', difficulty: 'normal', tags: ['age'], text: '선발 평균 나이 26세 이하',
    check: (s) => avg(s.lineup, (p) => p.age) <= 26 },
  { id: 'winter2', difficulty: 'normal', tags: ['stable'], text: '겨울 시장 거래 2건 이하',
    check: (s) => s.track.winterTransactions <= 2 },

  { id: 'age24', difficulty: 'hard', tags: ['age'], text: '선발 평균 나이 24세 이하',
    check: (s) => avg(s.lineup, (p) => p.age) <= 24 },
  { id: 'pace', difficulty: 'hard', tags: ['pace'], text: '전반기 승점이 목표 페이스 이상',
    check: (s) => s.firstHalfPoints >= s.goal / 2 },
  { id: 'spend50', difficulty: 'hard', tags: ['spend'], text: '영입 지출을 시즌 자금의 50% 이하로',
    check: (s) => s.track.spent <= s.grant * 0.5 },
];

export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const DIFFICULTY_LABELS = { easy: '쉬움', normal: '보통', hard: '어려움' };

export function getDemand(cardId) {
  return DEMAND_CARDS.find((c) => c.id === cardId) ?? null;
}

// 난이도마다 1장씩(쉬움/보통/어려움). bias = { [tag]: 가중치 배수 }
export function drawDemandOffer(rng = Math.random, bias = {}) {
  return DIFFICULTIES.map((difficulty) => {
    const pool = DEMAND_CARDS.filter((c) => c.difficulty === difficulty);
    const weights = pool.map((c) => c.tags.reduce((w, t) => w * (bias[t] ?? 1), 1));
    let pick = rng() * weights.reduce((a, b) => a + b, 0);
    return pool.find((_, i) => (pick -= weights[i]) < 0) ?? pool.at(-1);
  });
}

export function evaluateDemand(cardId, state) {
  const card = getDemand(cardId);
  return card ? card.check(state) : false;
}
