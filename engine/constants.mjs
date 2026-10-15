// 플레이스타일 태그 6종, 등급 없이 한 층. 규칙은 하나다:
//   같은 태그를 가진 선발이 3명이면 +1, 4명이면 +2, 5명 이상이면 +4 - 그 태그를 가진 선발 전원이 받는다(포지션 제한 없음).
// 성장 중: 아직 전성기에 닿지 않은 선수는 태그 효과를 절반만 받는다(인원 수에는 그대로 센다). 전성기에 닿으면 "완성"되어 100%.
// positions는 "그 태그를 가질 수 있는 포지션"이다(선수를 만들 때만 쓴다). 태그는 처음 3종(basic)이 1시즌부터, 나머지 3종(extra)은 2시즌에 열린다.
export const TAG_THRESHOLDS = [3, 4, 5];
export const TAG_VALUES = [1, 2, 4];
// 포메이션이 어울리는 태그(ui/formations.mjs의 tag)를 가진 선발 선수가 받는 OVR 보너스
export const FORMATION_TAG_BONUS = 1;
export const SEED_EFFECT = 0.5;
const withValues = (defs) => Object.fromEntries(
  Object.entries(defs).map(([id, d]) => [id, { ...d, thresholds: TAG_THRESHOLDS, values: TAG_VALUES }])
);
export const PLAYSTYLE_TAGS = withValues({
  pass: { group: 'basic', positions: ['GK', 'CB', 'DMF', 'CMF', 'AMF'] }, // 패스 플레이: 점유형
  dribble: { group: 'basic', positions: ['WB', 'W', 'AMF', 'ST', 'CMF'] }, // 돌파: 개인기로 뚫기
  physical: { group: 'basic', positions: ['GK', 'CB', 'DMF', 'CMF', 'ST'] }, // 몸싸움: 피지컬
  press: { group: 'extra', positions: ['ST', 'W', 'CMF', 'DMF', 'AMF'] }, // 전방 압박
  counter: { group: 'extra', positions: ['WB', 'W', 'ST', 'AMF', 'CMF'] }, // 역습
  buildup: { group: 'extra', positions: ['GK', 'CB', 'WB', 'DMF', 'CMF'] }, // 후방 빌드업
});
export const TAG_IDS = Object.keys(PLAYSTYLE_TAGS);
export const BASIC_TAGS = TAG_IDS.filter((t) => PLAYSTYLE_TAGS[t].group === 'basic');
export const EXTRA_TAGS = TAG_IDS.filter((t) => PLAYSTYLE_TAGS[t].group === 'extra');

// 이름 풀을 고르는 5개 권역(게임 규칙에는 쓰이지 않는다 - 대륙 시너지는 폐지).
export const CONTINENT_TAGS = {
  europe: {}, southAmerica: {}, africa: {}, asiaOceania: {}, northCentralAmerica: {},
};


// 스펙 6절 "조직력(팀 조직력)"
export const CHEMISTRY_START = 65;
export const CHEMISTRY_DECAY_PER_TRANSACTION = 2;
export const CHEMISTRY_RECOVERY_PER_STABLE_WEEK = 1;

// 조직력 -> 팀 전력 배율 꺾은선(조직력, 배율). 예전엔 96 이상에서 ×1.12로
// 절벽처럼 뛰었지만 12주 시장 안에 96은 사실상 못 넘어서 체감이 없었다.
// 시작값(60)에서 예전과 거의 같은 ×1.015로 맞춰 리그 밸런스를 안 흔든다.
export const CHEMISTRY_CURVE = [[0, 0.92], [60, 1.015], [100, 1.10]];

// 스펙 12절 "미확정 사항" — 시뮬레이터로 조정할 튜닝 상수.
// 여기서는 브레인스토밍에서 제시된 출발값을 그대로 코드 상수로 둔다.
export const TEAM_MULTIPLIER_CAP = 1.30;
// 이 공식은 teamPower(감독·조직력 배율이 곱해진 수치)를 리그 평균 "생 OVR"과
// 바로 뺀다 — 구조상 모든 팀이 리그 평균보다 10점 이상 높게 나온다. 그래서
// basePoints 42는 무조건 상향 보정이 됐고, 12주 이적시장에서 자금을 전부 쓰는
// 플레이어는 우승 확률 58%가 나왔다(sim 실측).
// basePoints를 "시작 스쿼드(무매매) 팀파워 = 간신히 잔류" 지점으로 다시 잡았다.
// 3000판 실측(base 18 / coef 2.5 / var 0.20):
//   적극 플레이  우승 27% / 승격 28% / 안전 43% / 강등  1%
//   시장 미사용  우승  4% / 승격 13% / 안전 69% / 강등 15%
export const LEAGUE_POINTS_COEFFICIENT = 2.5;
export const BASE_POINTS_AT_LEAGUE_AVERAGE = 18;
// 스펙 출발값 ±5%는 강등이 사실상 0%여서 한때 ±25%까지 키웠는데, 그건
// basePoints 오캘리브레이션을 운으로 덮는 상황이었다. 기준점을 고친 뒤로는
// ±20%로도 강등이 충분히 나온다(시장 미사용 15%) — 운의 비중을 다시 낮췄다.
export const POWER_VARIANCE_RATIO = 0.20;
// 반기 전술 방향(2시즌 해금): 기대 승점은 같고 기복만 다르다. 공격은 대박 또는 쪽박, 수비는 안정적.
export const DIRECTION_VARIANCE = { attack: 1.6, balance: 1, defense: 0.45 };

// 6등급 - OVR 범위. 모든 선수는 태그가 1개다(팀 컬러를 모으기 쉽게). 높은 등급의 이점은 개수가 아니라
// 태그 효과 증폭(TAG_AMP)과 월드클래스 이상의 개인 특기(FLAIR)다.
export const PLAYER_TIERS = {
  local: { minOVR: 50, maxOVR: 62 },
  bigLeaguer: { minOVR: 63, maxOVR: 72 },
  topClass: { minOVR: 73, maxOVR: 80 },
  worldClass: { minOVR: 81, maxOVR: 87 },
  legendary: { minOVR: 88, maxOVR: 94 },
  // god는 전 세계 2명, 개별 수작업 카드 — data/god-players.mjs 참고, 여기서 생성 안 함
};
// 태그 효과 증폭: 본인이 받는 태그 보너스에 곱한다(OVR 기준 등급).
export const TAG_AMP = [{ minOVR: 88, amp: 2 }, { minOVR: 81, amp: 1.5 }, { minOVR: 73, amp: 1.25 }];
export const tagAmp = (ovr) => TAG_AMP.find((t) => ovr >= t.minOVR)?.amp ?? 1;
// 개인 특기: 월드클래스(81+)는 본인 OVR +2, 레전더리(88+)는 +3. 이름은 포지션마다 다르다.
export const FLAIR_MIN_OVR = 81;
export const flairBonusFor = (ovr) => (ovr >= 88 ? 3 : ovr >= FLAIR_MIN_OVR ? 2 : 0);
export const FLAIR_BY_POSITION = {
  GK: '거미손', CB: '철벽', WB: '오버래퍼', DMF: '방패', CMF: '엔진', AMF: '플레이메이커', W: '드리블러', ST: '해결사',
};

export const POSITIONS = ['GK', 'CB', 'WB', 'DMF', 'CMF', 'AMF', 'W', 'ST'];

// 대가(영입가 배수). 그 성향을 가진 선수에게 늘 붙는다.
export const TRAIT_PRICE_MULT = { starPower: 1.5 };
// 성골 유스 대가: 시즌이 끝나면 이 확률로 이적 요구가 온다(수락 = 자유계약으로 떠남, 거부 = OVR 하락).
export const SEONGGOL_TRANSFER_DEMAND_CHANCE = 0.3;
export const SEONGGOL_REJECT_OVR_PENALTY = 3;
export const HOMETOWN_RELEASE_CHEMISTRY_PENALTY = 8;
// 스펙 5.1절 "선수 특수 성향" — id만. 효과는 engine/ovr.mjs가 specialTrait로 참조.
export const SPECIAL_TRAITS = [
  'starPower',
  'seongGolYouth',
  'veteranLeader',
  'superSub',
  'hometownHero',
  'journeyman',
];


// 스펙 5.3절 "스태프" — 4단계 등급, 선수/감독보다 약함
export const STAFF_LEVELS = ['academy', 'proLicense', 'veteran', 'master'];

// 스펙 7절 "경제" — 5부 기준 등급별 가격 범위(G). GOD은 개별 고정가(data/god-*.mjs)
export const PLAYER_PRICE_TABLE = {
  local: [10, 40],
  bigLeaguer: [40, 120],
  topClass: [120, 300],
  worldClass: [300, 700],
  legendary: [700, 1600],
};
export const STAFF_PRICE_TABLE = {
  academy: [20, 50],
  proLicense: [60, 150],
  veteran: [200, 400],
  master: [500, 800],
};

// 선수단 정원: 처음부터 끝까지 22명으로 고정(선발 11 + 벤치 5 + 예비 6). 정원이 차면 영입할 때 내보낼 선수를 고른다.
export const SQUAD_CAP = 22;
export const squadCapFor = () => SQUAD_CAP;
// 판매 등록한 선수가 시장 마감까지 안 팔리면 태업하고 선수단에 돌아온다(그 시즌 끝까지 OVR 하락).
export const SLUMP_OVR_PENALTY = 3;
// 클럽 레전드: 한 구단에서 5시즌 이상 뛰고 시즌 MVP(전반기·후반기 활약 점수 1위)를 2번 이상 받은 선수.
export const LEGEND_MIN_SEASONS = 5;
export const LEGEND_MIN_MVP = 2;
// 감독 탭이 열리는 시즌부터 감독 불화 규칙(벌칙·사임)이 발동한다. 그 전에는 선호 태그를 켜면 보너스만 있다.

export const COST_MODIFIER_CLAMP_MIN = -0.6; // 할인/할증 가산 합계 하한
export const COST_MODIFIER_CLAMP_MAX = 0.8; // 할인/할증 가산 합계 상한
export const WINTER_TAX_RATIO = 0.2; // 겨울 시장 영입비 +20%
export const WINTER_FUNDS_RATIO = 0.3; // 겨울 시장 진입 시 그 리그 시즌 지급액의 30%를 추가 지급

// 방출 회수율: 즉시 0%, 이적명단(여름/겨울 범위), Week12 데드라인 40%
export const RELEASE_RECOVERY_IMMEDIATE = 0;
export const RELEASE_RECOVERY_LISTED_SUMMER = [0.5, 1.0];
export const RELEASE_RECOVERY_LISTED_WINTER = [0.7, 1.1];
export const RELEASE_RECOVERY_DEADLINE = 0.4;

// 리그별 시즌 지급 자금(5부→1부). "그 리그에서 굵직한 선수를 사는 값"에 맞췄다:
// 하부(5·4부)는 선수 5~6명 교체분, 상위 리그는 굵직한 선수 3~4명분만 준다.
export const STARTING_FUNDS_BY_TIER = [330, 480, 800, 1300, 2000];
// 같은 리그에 남았을 때(선수단을 크게 안 갈아도 되는 시즌)의 지급 비율
export const SAME_LEAGUE_FUNDS_RATIO = 0.6;
// 5부만 따로 더 깎는다 - base × 1.5^index 공식을 그대로 두고 기준값(1000)만
// 낮추면 곱셈 구조상 4부 이상 리그 자금까지 전부 비례해서 확 깎여버린다
// (직접 재실측해서 확인함: 2부/1부 강등률이 50%대로 치솟음). "5부 자금이
// 너무 많다"는 5부에만 해당하는 얘기라, 5부(인덱스 0)에만 곱한다.
export const CARRYOVER_CAP_RATIO = 0.1; // 이월 자금 상한 = 다음 시즌 시작 자금의 10%(나머지는 구단이 회수)

// 스펙 7절 "드래프트(상점형)"
export const SHOP_OFFER_SIZE = 3; // 스카우터 없을 때 기본값
export const SHOP_REROLL_COST = 50;

// 스펙 5.3절 "스태프" 효과표
export const COACH_CHEMISTRY_DECAY_BY_LEVEL = { academy: 1.5, proLicense: 1, veteran: 0.5, master: 0 };
// 수석 코치의 육성: 성장 단계(초반·막바지) 선수는 시즌마다 chance 확률로 OVR이 +1 더 오르고, 정체(성장이 멈춤) 확률은 stall로 줄어든다.
export const COACH_GROWTH_BY_LEVEL = {
  academy: { chance: 0, stall: 0.10 },
  proLicense: { chance: 0.3, stall: 0.08 },
  veteran: { chance: 0.6, stall: 0.06 },
  master: { chance: 1, stall: 0.04 },
};
// 스카우터가 협상 슬라이더에 보여 주는 "구단 하한선 추정 구간": half = 구간 반폭(하한선 대비 비율), hit = 진짜 하한선이 구간 안에 있을 확률.
// 탐색(단서) 하나당 예상 이적료 구간 폭이 이만큼 줄어든다(최대 3개). 아카데미(힌트 없음)는 단서를 얻어야 구간이 생기고 그때 시작 폭은 EXPLORE_BASE_HINT.
export const EXPLORE_NARROW = 0.6;
export const EXPLORE_MAX_CLUES = 3;
export const EXPLORE_BASE_HINT = { half: 0.2, hit: 0.7 };
export const SCOUT_HAGGLE_HINT_BY_LEVEL = {
  academy: null,
  proLicense: { half: 0.12, hit: 0.6 },
  veteran: { half: 0.07, hit: 0.7 },
  master: { half: 0.05, hit: 0.8 },
};
// 스카우터 목표 지정 칸 수: 칸마다 태그 또는 포지션 하나를 정해 두면 매주 그 조건의 카드를 1장씩 보장한다.
export const SCOUT_TARGET_SLOTS_BY_LEVEL = { academy: 1, proLicense: 1, veteran: 2, master: 3 }; // v3: 지시에 걸 수 있는 조건(포지션·태그·나이대) 수

// 리그별 스태프·감독 시장에 나오는 등급. 5부에 마스터 코치나 레전더리 감독이 있는 건 비현실적이다.
export const STAFF_LEVELS_BY_TIER = {
  tier5: ['academy', 'proLicense'],
  tier4: ['academy', 'proLicense', 'veteran'],
  tier3: ['academy', 'proLicense', 'veteran', 'master'],
  tier2: ['academy', 'proLicense', 'veteran', 'master'],
  tier1: ['academy', 'proLicense', 'veteran', 'master'],
};
// 리그가 "이 정도 감독은 있어야 한다"고 기대하는 감독 배율. 감독 배율을 이 값으로
// 나눈 값이 실제로 곱해진다 - 상위 리그에서 루키 감독을 유지하면 그만큼 손해.
// 스카우터 능력 4가지: 매물 장수 / 상위 등급 카드 확률 / 다시 뽑기 할인 / 목표 지정(매주 보장 카드).
export const SCOUT_SHOP_OFFER_SIZE_BY_LEVEL = { academy: 3, proLicense: 3, veteran: 3, master: 3 }; // v3: 지시 한 번에 항상 3명
// 톱클래스 이상 카드가 나올 가중치 배율 증가분(리그에 없는 등급은 그대로 0).
export const SCOUT_QUALITY_BOOST_BY_LEVEL = { academy: 0, proLicense: 0.25, veteran: 0.5, master: 1.2 };

// GOD 카드(선수)가 상점에 뜰 확률 — 전 세계 2명뿐이라 극희귀. 1부 상점에서만
// 굴린다(data/draft-shop.mjs) - 하부리그에 최상위 카드가 섞이면 위화감이 크다.
export const GOD_PLAYER_SHOP_CHANCE = 0.005;

// 승격 전용 위기: 이적 요구가 발동할 확률 (스펙 8절, 승격 직후 시즌에만)
export const PROMOTION_TRANSFER_DEMAND_CHANCE = 0.5;

// 스펙 2절 "시즌 분할 체계" — 여름 시장(1~8주) → 전반기 → 겨울 시장(9~12주) → 후반기
export const SUMMER_MARKET_WEEKS = [1, 8];
export const WINTER_MARKET_WEEKS = [9, 12];

// 스펙 8절 "승격 보상" — 조직력 상승 속도 2배는 슬라이스에서 생략(별도 시즌 플래그 필요), 나머지 둘만 적용
export const PROMOTION_CHEMISTRY_BONUS = 5;
// 스쿼드를 유지한 채 승격한 첫 시즌의 지급액 비율(예전엔 +10% 보너스). 이미 키운
// 스쿼드에 새 리그 지급액을 그대로 주면 돈이 남아돌아 계산 없이 사고팔 수 있었다.
export const PROMOTION_STAY_FUNDS_RATIO = 0.7;

// 스펙 3절/8절 "이벤트" — 슬라이스 범위: 일반 위기 2 + 일반 기회 3 + 승격 전용 위기 2
export const PROMOTION_TRANSFER_DEMAND_OVR_PENALTY = 5; // 거부 시 그 시즌 OVR 하락(출발값, 튜닝 대상)
export const SPONSORSHIP_FUNDS_BONUS_RATIO = 0.2; // 메인 스폰서십 특수: 시작 자금 +20%
export const FA_FIRE_SALE_DISCOUNT_RATIO = -0.5; // FA 급매물 등장: 50% 할인
export const AGENT_BACKLASH_SURCHARGE_RATIO = 0.1; // 에이전트의 뒷공작: 영입비 +10%

// 스펙 2절: 기대 목표(targetPoints) 미달이 이만큼 누적되면 해임된다.
export const MISSED_TARGET_LIMIT = 3;
// 승격 못 하고 같은 리그에 계속 머무르면 시즌 지급 자금이 미달 누적 1회당
// 이만큼 깎인다(승격하면 missedTargetCount가 0으로 리셋되니 이 페널티도
// 같이 풀린다). MISSED_TARGET_LIMIT(3) 전까지만 쌓이므로 최대 -30%.
export const STAGNATION_FUNDS_PENALTY_PER_MISS = 0.15;

// 명예 점수(명성): 한 런에서 쌓은 업적의 합. 도달 리그, 버틴 시즌, 리그별 우승(위로 갈수록 크게),
// 연속 우승 보너스, 챔피언스리그 성적(결과별), 더블.
export const REPUTATION_PER_TIER = 10; // 도달한 리그 단계마다
export const REPUTATION_PER_SEASON = 3; // 버틴 시즌마다
export const REPUTATION_TITLE_BY_TIER = { tier5: 20, tier4: 30, tier3: 40, tier2: 50, tier1: 70 };
export const REPUTATION_STREAK_BONUS = 25; // 2연속 우승부터 그 우승마다 추가
export const REPUTATION_UCL_BY_RESULT = { league: 15, playoff: 20, r16: 30, qf: 45, sf: 65, final: 95, champion: 170 };
export const REPUTATION_DOUBLE = 100; // 같은 시즌 1부 우승 + 챔피언스리그 우승

// 이사진 시즌 목표(승점) - 안전선과 승격선 사이 어디쯤에 둘지(0=안전선, 1=승격선).
// 초과 달성한 승점 1점당 다음 시즌 지급액의 1.5%(상한 30%)를 보너스로 주고,
// 한 점이라도 넘기면 조직력도 올려준다.
export const BOARD_GOAL_POSITION = 0.6;
export const BOARD_REWARD_FUNDS_PER_POINT = 0.015;
export const BOARD_REWARD_FUNDS_CAP = 0.3;
export const BOARD_REWARD_CHEMISTRY = 5;

// 시즌 이벤트 발생 확률(시즌 여름 시작 / 겨울 시장 진입). 플레이 후 조절 대상.
export const EVENT_CHANCE_SUMMER = 0.9;
export const EVENT_CHANCE_WINTER = 0.7;

// 이사진 요구 카드 달성 보상 - 다음 시즌 지급액 대비 비율(난이도별).

// ---------- 명성 점수(Prestige) ----------
// 시즌이 끝날 때마다 쌓이는 점수. 런 중에도 보이고, 런이 끝나면 등급과 기록 순위가 붙는다.
// 리그가 높을수록 같은 성적의 값이 커지고(5부 우승 50 → 1부 우승 400), 오래 버티는 것보다
// 올라가고 우승하는 쪽이 훨씬 크게 쳐준다.
export const PRESTIGE_TIER_BASE = { tier5: 10, tier4: 20, tier3: 35, tier2: 55, tier1: 80 };
export const PRESTIGE_RESULT_MULT = { safe: 1, promotion: 3, champion: 5 }; // 잔류 / 승격 / 우승
export const PRESTIGE_SURPLUS_RATE = 0.5; // 안전 승점을 넘은 승점 1점당
export const PRESTIGE_COMBO_STEP = 10; // 연속 승격·우승: 2번째부터 (n-1)*10, 최대 60
export const PRESTIGE_COMBO_MAX = 60;
export const PRESTIGE_TITLE_STREAK = 30; // 연속 리그 우승: 2번째 우승부터 우승마다
export const PRESTIGE_UCL = { league: 20, playoff: 30, r16: 50, qf: 80, sf: 120, final: 180, champion: 300 };
export const PRESTIGE_DOUBLE = 150; // 같은 시즌 리그 우승 + 챔피언스리그 우승
export const PRESTIGE_RETIRE = 200; // 1부 우승 후 은퇴로 커리어를 완결

// 런 점수 등급(런 하나의 점수 기준). 피라미드: 사람처럼 플레이하는 봇 v2 규칙 300개 런 기준으로(2026-10-10 재측정)
// D 29% · C 26% · B 19% · A 14% · S 9% · SS 4%가 되도록 잡았다(위로 갈수록 확실히 드물다).
export const PRESTIGE_GRADES = [
  { id: 'SS', min: 1700 }, { id: 'S', min: 1100 }, { id: 'A', min: 800 }, { id: 'B', min: 550 }, { id: 'C', min: 200 }, { id: 'D', min: 0 },
];
// 칭호(커리어 누적 점수 기준). 올라가기만 한다.
export const PRESTIGE_TITLES = [
  { min: 0, label: '무명 감독' }, { min: 150, label: '동네 감독' }, { min: 400, label: '지역 명장' }, { min: 900, label: '프로 감독' },
  { min: 1800, label: '이름난 전술가' }, { min: 3500, label: '명장' }, { min: 7000, label: '리그의 전설' }, { min: 14000, label: '전설의 감독' },
];
