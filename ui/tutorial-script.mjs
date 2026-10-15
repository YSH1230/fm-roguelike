// 튜토리얼(스크립트형): 본 게임 상태·난수와 분리된 고정 상태 + 정해진 단계. 설계: docs/tutorial-redesign-2026-10-15.md
// 이 모듈은 데이터만 가진다(난수·저장·기록 없음). 화면 연결(가로채기·이벤트)은 ui/app.mjs가 한다.
import { DEFAULT_FORMATION } from './formations.mjs';

const TUT_CLUB = { id: 'tutorial-fc', name: 'FM 유나이티드', kit: '#3a8bd8', kit2: '#f4f1e8', tierId: 'tier5', klass: 'mid', startingFundsMultiplier: 1, expectationModifier: 0 };

// 선수 한 명(고정). stars = 3 + (baseOVR + obsErr − 59) / 6 (5부 기준): 65 → ★4, 62 → ★3.5, 59 → ★3, 56 → ★2.5, 53 → ★2.
const player = (id, name, position, age, baseOVR, extra = {}) => ({
  id, name, position, age, baseOVR,
  peakOVR: baseOVR + (age <= 22 ? 8 : 0), peakBodyAge: 27, obsErr: 0, volatility: 'normal', form: 0, prevForm: 0, obsP: 12.2,
  durability: 'normal', curve: null, rhythm: null, team: null, adapt: null, settle: null,
  injHistory: [], flair: null, price: Math.max(10, Math.round((baseOVR - 40) * 2)),
  playstyleTags: [], continentTag: 'europe', specialTrait: null, isDraftedYouth: false, personality: null,
  seasonsAtClub: 1, acquiredThisSeason: false, inBench: false, boughtThisSeason: false,
  ...extra,
});

// 선발 11(4-3-3) + 벤치 5. 예비 없음. 성격은 4종이 한 명씩(화면에는 안 보인다).
export const TUTORIAL_SQUAD = [
  player('t01', 'Marcus Webb', 'GK', 27, 59, { playstyleTags: ['physical'] }),
  player('t02', 'Tomas Reyes', 'CB', 26, 62, { playstyleTags: ['buildup'], continentTag: 'southAmerica', personality: 'loyal' }),
  // 시연: 특수 성향 칩 + 부상 이력 칩 + 별 최고(★4, 주장 후보)
  player('t03', 'Kofi Mensah', 'CB', 29, 65, { playstyleTags: ['physical', 'buildup'], continentTag: 'africa', specialTrait: 'starPower', durability: 'fragile', injHistory: [{ kind: 'half', ago: 1, part: 'ham' }], personality: 'ambitious' }),
  player('t04', 'Daniel Okafor', 'WB', 24, 59, { playstyleTags: ['dribble'], continentTag: 'africa' }),
  player('t05', 'Ravi Sharma', 'WB', 25, 59, { playstyleTags: ['counter'], continentTag: 'asiaOceania' }),
  player('t06', 'Luca Ferrara', 'DMF', 28, 62, { playstyleTags: ['press'] }),
  player('t07', 'Jonas Lindqvist', 'CMF', 26, 59, { playstyleTags: ['pass'], personality: 'mood' }),
  player('t08', 'Mateo Silva', 'CMF', 23, 62, { playstyleTags: ['pass', 'dribble'], continentTag: 'southAmerica', peakOVR: 69 }),
  player('t09', 'Kenji Mori', 'W', 22, 59, { playstyleTags: ['counter'], continentTag: 'asiaOceania', peakOVR: 66 }),
  player('t10', 'Elias Brandt', 'W', 27, 56, { playstyleTags: ['dribble'] }),
  player('t11', 'Victor Nunez', 'ST', 25, 62, { playstyleTags: ['counter', 'physical'], continentTag: 'southAmerica', personality: 'gambler' }),
  // 벤치
  player('t12', 'Henrik Moller', 'GK', 31, 53),
  player('t13', 'Sean Doyle', 'CB', 30, 56, { playstyleTags: ['buildup'] }),
  player('t14', 'Alex Petrov', 'ST', 31, 53, { playstyleTags: ['physical'], price: 18 }), // 판매 연습
  player('t15', 'Theo Marchand', 'W', 19, 56, { playstyleTags: ['dribble'], peakOVR: 66, volatility: 'steady' }), // ☆ 연습(성장폭 ↗)
  player('t16', 'Ivan Kovac', 'CMF', 28, 53),
];

// 영입 카드 3장(2주차 도착). tc1만 협상 대상.
const card = (id, name, position, age, baseOVR, price, seller, extra = {}) => ({ ...player(id, name, position, age, baseOVR, { price, seasonsAtClub: 0, acquiredThisSeason: true }), seller, ...extra });
export const TUTORIAL_CARDS = [
  card('tc1', 'Nikolai Brandt', 'CB', 24, 62, 40, 'Ashcombe Town', { playstyleTags: ['physical', 'buildup'], peakOVR: 68 }),
  card('tc2', 'Joel Santos', 'CMF', 27, 59, 22, 'Fenwick Rovers', { playstyleTags: ['pass'], continentTag: 'southAmerica' }),
  card('tc3', 'Amir Hadid', 'W', 20, 56, 14, 'Norwick Town', { playstyleTags: ['dribble'], continentTag: 'asiaOceania', peakOVR: 66 }),
];

// 상대 구단 고정 색(튜토리얼은 리그 구단을 무작위로 뽑지 않는다)
export const TUTORIAL_KITS = { 'Ashcombe Town': '#c0392b', 'Fenwick Rovers': '#2e8b57', 'Norwick Town': '#d4a017' };

// 협상(tc1): 구단 태도 보통, 인내심 3(소모 없음), 하한선 34G.
export const TUTORIAL_HAGGLE = { attitude: { score: 0, label: '보통' }, patience: 3, reserve: { tc1: 34 } };

// 판매 오퍼(t14): 이번 주를 기준으로 기한을 붙인다.
export const tutorialSaleOffers = (week) => [
  { club: 'Fenwick Rovers', amount: 12, expires: week + 2 },
  { club: 'Norwick Town', amount: 15, expires: week },
];

// 시장 마감 연출(고정 기자 3명)과 전반기 결과(고정)
export const TUTORIAL_JOURNALISTS = [
  { outlet: '스포츠 데일리', name: '한낙관', rank: 7, line: '“보강이 맞아떨어지면 중위권 위로 갑니다.”' },
  { outlet: '데이터 라인', name: '서분석', rank: 9, line: '“지표상 중위권입니다.”' },
  { outlet: '나이트 뉴스', name: '오비관', rank: 12, line: '“잔류가 먼저입니다.”' },
];
export const TUTORIAL_HALF = {
  points: 33,
  injuries: [],
  starChanges: [
    { name: 'Mateo Silva', before: '★3.5', after: '★4', up: true, down: false },
    { name: 'Kenji Mori', before: '★3', after: '★4', up: true, down: false },
    { name: 'Elias Brandt', before: '★2.5', after: '★2', up: false, down: true },
  ],
  ratings: { t03: 7.8, t08: 7.4, t11: 7.1, t06: 6.9, t01: 6.7, t02: 6.8, t04: 6.5, t05: 6.4, t07: 6.6, t09: 7.2, t10: 6.0 },
  mvpPoints: { t03: { sum: 7.8, n: 1 }, t08: { sum: 7.4, n: 1 }, t09: { sum: 7.2, n: 1 } },
};

// 고정 상태(본 게임 currentState와 같은 모양이라 기존 렌더를 그대로 쓴다). 난수·Date를 쓰지 않는다.
export function buildTutorialState() {
  const squad = TUTORIAL_SQUAD.map((p) => ({ ...p }));
  return {
    tutorial: true,
    club: { ...TUT_CLUB },
    squad,
    staff: {
      headCoach: { role: 'headCoach', level: 'proLicense', focus: 'midfield', name: 'Abdulai Cisse', continentTag: 'africa' },
      headScout: { role: 'headScout', level: 'proLicense', name: 'Kayode Kargbo', continentTag: 'africa' },
    },
    availableGodPlayers: [],
    scoutOrder: { pos: null, tag: null, age: null },
    eventChoice: null, eventHistory: [], nextGrantBonus: 0,
    chemistry: 60, funds: 120, eventMessage: '', eventTone: null, expectationModifier: 0,
    leagueTierId: 'tier5', highestTierId: 'tier5', titles: 0, uclTitles: 0, titlesByTier: {}, titleStreak: 0, streakPoints: 0, uclResults: {}, doubles: 0,
    prestige: { total: 0, rows: {}, combo: 0, titleStreak: 0, beat: false },
    missedTargetCount: 0, philosophy: null, appointed: false, probationUsed: false,
    seasonNumber: 1, startedAt: 0, telemetryRun: 'tutorial',
    formation: DEFAULT_FORMATION, manualOverrides: {}, benchOverrides: {}, selectedSlot: null,
    tab: 'draft', draftSub: 'players', week: 1, phase: 'summer', transactedThisWeek: false,
    shopOffer: [], staffOffer: {}, firstHalfPoints: null, listedForSale: [],
    seasonTrack: { spent: 0, winterTransactions: 0, income: 0, start: 120 },
    boardTrustUsed: false, promotionFundsBonusPending: false, freshBudget: false, pendingTransferProceeds: 0,
    marks: {}, seasonStartStars: {}, windowBuys: [], justBoughtIds: [], clues: {}, patience: {}, rejected: {}, counterOffer: {}, bidMemory: {},
  };
}

// 단계 표(16단계 + 종료 안내). trigger: 화면이 부르는 이벤트 이름('confirm'은 안내 박스의 [확인]). allow: 클릭을 통과시킬 셀렉터(스포트라이트 대상 밖).
// tab/sub: 단계가 시작될 때 스크립트가 직접 이동한다. keep: 화면을 다시 그리지 않는다. inModal: 대상이 위에 열린 창 안에 있다.
export const TUTORIAL_STEPS = [
  { id: 'goal', tab: 'draft', sub: 'players', selector: '#goal-strip', text: '안녕하세요, 감독님! 올리비아예요. 이번 시즌 승점 38점(잔류)만 지키면 정식 감독이 돼요!', trigger: 'confirm' },
  { id: 'scout', tab: 'draft', sub: 'players', selector: '#scout-order', text: '스카우트 조건을 하나 골라 보세요! 맞는 선수 3명이 와요.', trigger: 'scoutOrderPicked', allow: ['#scout-order'] },
  { id: 'arrive', tab: 'draft', sub: 'players', selector: 'ul.offers', text: '선수 3명이 도착했어요! 튜토리얼에서는 바로 와요.', trigger: 'confirm' },
  { id: 'card', tab: 'draft', sub: 'players', selector: '[data-row="tc1"] [data-more]', text: '카드를 눌러 리포트를 읽어요! 별 아래에 스태프 의견이 있어요.', trigger: 'cardOpened', allow: ['[data-row="tc1"]'] },
  { id: 'haggle', keep: true, selector: '[data-row="tc1"] [data-buy]', text: '[협상]을 누르고 [탐색]으로 정보를 모아요! 첫 번째는 공짜예요.', trigger: 'haggleOpened', allow: ['[data-row="tc1"]'] },
  { id: 'explore', selector: '[data-explore]', inModal: true, text: '[협상]을 누르고 [탐색]으로 정보를 모아요! 첫 번째는 공짜예요.', trigger: 'explored', allow: ['[data-explore]'] },
  { id: 'bid', selector: '#bid-go', inModal: true, text: '이제 가격을 정해 [제안]해요!', trigger: 'bidSent', allow: ['#eventmodal-root'] },
  { id: 'funds', tab: 'draft', sub: 'players', selector: '#mk-more-btn', text: '영입하면 자금(G)이 줄고 조직력이 조금 떨어져요! 영입·판매가 많을수록 더 떨어져요.', trigger: 'confirm' },
  { id: 'tactics', tab: 'tactics', selector: '.formations', text: '포메이션을 눌러 보세요! 같은 태그 선수가 모일수록 팀 스타일이 강해져요.', trigger: 'formationPicked', allow: ['.formations'] },
  { id: 'cap', tab: 'squad', selector: '.sqsum', text: '선수단은 최대 22명이에요. 여기서 현재 인원을 확인해요!', trigger: 'confirm' },
  { id: 'mark', tab: 'squad', selector: '[data-row="t03"] [data-mark]', text: '☆를 누르면 유망(★), 한 번 더 누르면 정리 후보(✂)예요! 두 번 눌러 보세요.', trigger: 'marked', allow: ['[data-row="t03"] [data-mark]'] },
  { id: 'list', tab: 'squad', selector: '[data-row="t14"]', text: '이 선수를 판매 등록해 봐요! 등록하면 선발에서 빠지고 판매 중에 들어가요.', trigger: 'listed', allow: ['[data-row="t14"]'] },
  { id: 'sale', tab: 'draft', sub: 'sell', selector: '.sellcard', text: '오퍼를 눌러 [더 불러 보기]로 가격을 올려 봐요! 마음에 들면 수락해요.', trigger: 'offerAccepted', allow: ['.sellcard', '#eventmodal-root'] },
  { id: 'staff', tab: 'staff', selector: '.mgrpanel', text: '스카우터는 지시 칸과 좋은 카드를, 코치는 성장과 조직력을 도와요! 둘 다 등급이 높을수록 리포트가 자세해져요.', trigger: 'confirm' },
  { id: 'next', tab: 'draft', sub: 'players', selector: '#next-week-btn', text: '이제 [다음 주로]를 눌러요! 튜토리얼에서는 시즌이 한 번에 지나가요.', trigger: 'nextWeekPressed', allow: ['#next-week-btn'] },
  { id: 'half', selector: '.verdict', text: '전반기 결산이에요! 목표 페이스와 비교해 보세요.', trigger: 'confirm', allow: ['#tut-preview-go'] },
  { id: 'result', selector: '.verdict', text: '시즌 결과예요! 후반기도 같은 방식으로 결산돼요.', trigger: 'confirm' },
  { id: 'stars', keep: true, selector: '.agingbox--reeval', text: '별이 ▲▼로 움직였어요! 별은 세상의 평가라서 시즌마다 조금씩 변해요.', trigger: 'confirm' },
  { id: 'prestige', keep: true, selector: '.panel.prestige', text: '명성은 이번 판의 점수예요! 승격·우승으로 쌓이고, 판이 끝나면 등급이 매겨져요.', trigger: 'confirm' },
];

// 시즌 결과(고정): 잔류 달성, 고정 명성 +24
export const TUTORIAL_RESULT = {
  points: 66, firstHalf: 33, secondHalf: 33, rank: 4,
  prestige: [{ label: '5부 잔류', value: 14 }, { label: '안전 승점 초과', value: 10 }],
};

// 종료 안내
export const TUTORIAL_END_TEXT = '이제 진짜 구단을 만들어 볼까요?';
