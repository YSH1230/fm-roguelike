// 이사진 요구 카드(선택형 보너스). 달성하면 다음 시즌 자금 보너스, 못 해도 페널티 없음.
// check(s, param)의 s = { lineup, chemistry, track, firstHalfPoints, grant, goal }
//   track = { spent(이번 시즌 영입 지출), winterTransactions(겨울 시장 거래 수) }
// tags는 구단 색채가 카드 추첨을 편향시키는 데 쓴다(club.demandBias).
const avg = (xs, f) => (xs.length ? xs.reduce((n, x) => n + f(x), 0) / xs.length : 0);

export const DEMAND_CARDS = [
  { id: 'young1', difficulty: 'easy', tags: ['youth'], text: '선발 중 21세 이하 1명 이상',
    check: (s) => s.lineup.filter((p) => p.age <= 21).length >= 1 },
  { id: 'chem50', difficulty: 'easy', tags: ['stable'], text: '시즌 종료 때 조직력 50 이상',
    check: (s) => s.chemistry >= 50 },
  { id: 'age28', difficulty: 'easy', tags: ['age'], text: '선발 평균 나이 28세 이하',
    check: (s) => avg(s.lineup, (p) => p.age) <= 28 },

  { id: 'young3', difficulty: 'normal', tags: ['youth'], text: '선발 중 21세 이하 3명 이상',
    check: (s) => s.lineup.filter((p) => p.age <= 21).length >= 3 },
  { id: 'age26', difficulty: 'normal', tags: ['age'], text: '선발 평균 나이 26세 이하',
    check: (s) => avg(s.lineup, (p) => p.age) <= 26 },
  { id: 'winter2', difficulty: 'normal', tags: ['stable'], text: '겨울 시장 거래 2건 이하',
    check: (s) => s.track.winterTransactions <= 2 },
  { id: 'spend60', difficulty: 'normal', tags: ['spend'], text: '선수 영입에 쓴 돈을 시즌 지급 자금의 60% 이하로 (40%는 남기기)', short: '영입 지출 60% 이하 (40% 남기기)',
    check: (s) => s.track.spent <= s.grant * 0.6 },

  { id: 'age24', difficulty: 'hard', tags: ['age'], text: '선발 평균 나이 24세 이하',
    check: (s) => avg(s.lineup, (p) => p.age) <= 24 },
  { id: 'pace', difficulty: 'hard', tags: ['pace'], text: '전반기 승점이 목표 페이스 이상',
    check: (s) => s.firstHalfPoints >= s.goal / 2 },
  { id: 'spend40', difficulty: 'hard', tags: ['spend'], text: '선수 영입에 쓴 돈을 시즌 지급 자금의 40% 이하로 (60%는 남기기)', short: '영입 지출 40% 이하 (60% 남기기)',
    check: (s) => s.track.spent <= s.grant * 0.4 },
];

// 1부 전용 챔피언스리그 카드. tier가 있는 카드는 그 리그 오퍼에만 나오고, 1부 오퍼에는 "챔스 진출"이
// 항상 포함된다. deferred 카드는 챔스가 끝난 뒤(uclResult)에야 판정한다.
DEMAND_CARDS.push(
  { id: 'uclQualify', difficulty: 'normal', tags: ['pace'], tier: 'tier1', text: '챔피언스리그 진출 (리그 4위 이내)',
    check: (s) => !!s.uclQualified },
  { id: 'uclQF', difficulty: 'hard', tags: ['pace'], tier: 'tier1', deferred: true, text: '챔피언스리그 8강 이상',
    check: (s) => ['qf', 'sf', 'final', 'champion'].includes(s.uclResult) },
  { id: 'uclChamp', difficulty: 'hard', tags: [], tier: 'tier1', deferred: true, text: '챔피언스리그 우승',
    check: (s) => s.uclResult === 'champion' },
);

export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const DIFFICULTY_LABELS = { easy: '쉬움', normal: '보통', hard: '어려움' };

export function getDemand(cardId) {
  return DEMAND_CARDS.find((c) => c.id === cardId) ?? null;
}

// 난이도마다 1장씩(쉬움/보통/어려움). bias = { [tag]: 가중치 배수 }
export function drawDemandOffer(rng = Math.random, bias = {}, tierId = null) {
  const offer = DIFFICULTIES.map((difficulty) => {
    const pool = DEMAND_CARDS.filter((c) => c.difficulty === difficulty && (!c.tier || c.tier === tierId));
    const weights = pool.map((c) => c.tags.reduce((w, t) => w * (bias[t] ?? 1), 1));
    let pick = rng() * weights.reduce((a, b) => a + b, 0);
    return pool.find((_, i) => (pick -= weights[i]) < 0) ?? pool.at(-1);
  });
  if (tierId === 'tier1') offer[1] = getDemand('uclQualify'); // 1부는 챔피언스리그 진출 요구가 항상 있다
  return offer;
}

export function evaluateDemand(cardId, state) {
  const card = getDemand(cardId);
  return card ? card.check(state) : false;
}
