// 스펙 5.1절 "플레이스타일 태그 8종" 표.
// 보너스를 기존값보다 크게 올렸다(11-A 밸런스 패치) - 자동 배치(OVR 최고
// 순 자동 선발)가 항상 이겨서 수동으로 태그를 맞출 이유가 없었다. 이
// 값들은 tools/tune-ladder.mjs의 시뮬레이션 봇이 태그를 전혀 안 보고
// OVR로만 사는 "방치 플레이" 기준선이라, 여기를 올려도 그 시뮬레이터
// 수치(리그 튜닝값)는 안 흔들린다 - 직접 태그를 맞추는 사람만 득을 본다.
export const PLAYSTYLE_TAGS = {
  gegenpressing: { positions: ['ST', 'CMF'], tier3: 6, tier5: 10 },
  falseNine: { positions: ['W', 'AMF'], tier3: 6, tier5: 10 },
  longBallKickAndRush: { positions: ['ST', 'AMF'], tier3: 6, tier5: 10 },
  tikiTaka: { positions: ['CMF', 'AMF'], tier3: 5, tier5: 8 },
  totalFootball: { positions: ['WB', 'CMF'], tier3: 5, tier5: 9 },
  falseFullBack: { positions: ['WB', 'CB'], tier3: 5, tier5: 8 }, // 변형 3백
  buildUpFromBack: { positions: ['CB', 'GK'], tier3: 4, tier5: 6 }, // 후방 빌드업
  counterAttack: { positions: ['W', 'ST'], tier3: 4, tier5: 6 }, // 선수비 후역습
};

// 스펙 5.1절 "대륙 태그 5종" 표 — 포지션 무관, 5개 권역 동일 수치.
// 위 플레이스타일과 같은 이유로 상향(3/5 → 5/8).
export const CONTINENT_TAGS = {
  europe: { tier3: 5, tier5: 8 },
  southAmerica: { tier3: 5, tier5: 8 },
  africa: { tier3: 5, tier5: 8 },
  asiaOceania: { tier3: 5, tier5: 8 },
  northCentralAmerica: { tier3: 5, tier5: 8 },
};

// 스펙 5.2절 "배율" — 루키/택티션/레전더리/GOD
export const MANAGER_TIER_MULTIPLIER = {
  rookie: 1.00,
  tactician: 1.05,
  legendary: 1.12,
  god: 1.20,
};

// 스펙 6절 "적응도(팀 조직력)"
export const CHEMISTRY_START = 60;
export const CHEMISTRY_DECAY_PER_TRANSACTION = 2;
export const CHEMISTRY_RECOVERY_PER_STABLE_WEEK = 1;

// 적응도 -> 팀 전력 배율 꺾은선(적응도, 배율). 예전엔 96 이상에서 ×1.12로
// 절벽처럼 뛰었지만 12주 시장 안에 96은 사실상 못 넘어서 체감이 없었다.
// 시작값(60)에서 예전과 거의 같은 ×1.015로 맞춰 리그 밸런스를 안 흔든다.
export const CHEMISTRY_CURVE = [[0, 0.94], [60, 1.015], [100, 1.08]];

// 스펙 12절 "미확정 사항" — 시뮬레이터로 조정할 튜닝 상수.
// 여기서는 브레인스토밍에서 제시된 출발값을 그대로 코드 상수로 둔다.
export const TEAM_MULTIPLIER_CAP = 1.30;
// 이 공식은 teamPower(감독·적응도 배율이 곱해진 수치)를 리그 평균 "생 OVR"과
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

// 스펙 5.1절 "6등급" — OVR 범위와 등급별 플레이스타일 태그 개수
export const PLAYER_TIERS = {
  local: { minOVR: 50, maxOVR: 62, playstyleTagCount: 1 },
  bigLeaguer: { minOVR: 63, maxOVR: 72, playstyleTagCount: 1 },
  topClass: { minOVR: 73, maxOVR: 80, playstyleTagCount: 2 },
  worldClass: { minOVR: 81, maxOVR: 87, playstyleTagCount: 2 },
  legendary: { minOVR: 88, maxOVR: 94, playstyleTagCount: 3 },
  // god는 전 세계 2명, 개별 수작업 카드 — data/god-players.mjs 참고, 여기서 생성 안 함
};

export const POSITIONS = ['GK', 'CB', 'WB', 'CMF', 'AMF', 'W', 'ST'];

// 스펙 5.1절 "선수 특수 성향 6종" — id만. 효과는 engine/ovr.mjs가 specialTrait로 참조.
export const SPECIAL_TRAITS = [
  'seongGolYouth',
  'veteranLeader',
  'superSub',
  'hometownHero',
  'polyglot',
  'journeyman',
];

// 스펙 5.2절 "감독 세부 성향 9종" — GOD은 전 세계 2명, 개별 수작업(data/god-managers.mjs)
export const MANAGER_TIERS = ['rookie', 'tactician', 'legendary'];
export const MANAGER_TRAITS = [
  'hairdryer', // 헤어드라이어 — 루키/택티션 한정 (아래 참고)
  'boardTrust', // 보드진의 신임
  'silverTongue', // 화술의 달인
  'youthCallUp', // 유스 콜업
  'reboundArchitect', // 리빌딩 장인
  'firefighter', // 소방수
  'crisisManager', // 위기 관리형
  'longTermReign', // 장기 집권형
  'tacticalPurist', // 전술 원리주의자
];
// 헤어드라이어는 적응도 +20을 즉시 주는 고배율급 효과라 낮은 등급 감독에만 배치
export const HIGH_TIER_RESTRICTED_TRAITS = ['hairdryer'];

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
// 선수 가격표의 절반 수준. 감독 이적은 시장 거래가 아니라 계약 해지금(바이아웃)
// 구조라 톱급 선수 이적료보다 확실히 싸다 — 현실 고증.
export const MANAGER_PRICE_TABLE = {
  rookie: [10, 30],
  tactician: [80, 200],
  legendary: [400, 800],
};
export const STAFF_PRICE_TABLE = {
  academy: [20, 50],
  proLicense: [60, 150],
  veteran: [200, 400],
  master: [500, 800],
};

export const COST_MODIFIER_CLAMP_MIN = -0.6; // 할인/할증 가산 합계 하한
export const COST_MODIFIER_CLAMP_MAX = 0.8; // 할인/할증 가산 합계 상한
export const WINTER_TAX_RATIO = 0.2; // 겨울 시장 영입비 +20%
export const WINTER_FUNDS_RATIO = 0.3; // 겨울 시장 진입 시 그 리그 시즌 지급액의 30%를 추가 지급

// 재계약 연장 연수 → 원가 비율. 2년은 1년 2번(60%)보다 싸게 - 오래 묶이는 리스크(하락/노쇠)를 보상한다.
export const CONTRACT_RENEWAL_RATIO = { 1: 0.3, 2: 0.5 };

// 방출 회수율: 즉시 0%, 이적명단(여름/겨울 범위), Week12 데드라인 40%
export const RELEASE_RECOVERY_IMMEDIATE = 0;
export const RELEASE_RECOVERY_LISTED_SUMMER = [0.5, 1.0];
export const RELEASE_RECOVERY_LISTED_WINTER = [0.7, 1.1];
export const RELEASE_RECOVERY_DEADLINE = 0.4;

export const STARTING_FUNDS_TIER5 = 1000;
// 5부만 따로 더 깎는다 - base × 1.5^index 공식을 그대로 두고 기준값(1000)만
// 낮추면 곱셈 구조상 4부 이상 리그 자금까지 전부 비례해서 확 깎여버린다
// (직접 재실측해서 확인함: 2부/1부 강등률이 50%대로 치솟음). "5부 자금이
// 너무 많다"는 5부에만 해당하는 얘기라, 5부(인덱스 0)에만 곱한다.
export const TIER5_FUNDS_DISCOUNT = 0.55;
export const FUNDS_MULTIPLIER_PER_LEAGUE_TIER = 1.5;
export const CARRYOVER_CAP_RATIO = 0.3; // 이월 자금 상한 = 다음 시즌 시작 자금의 30%

// 스펙 7절 "드래프트(상점형)"
export const SHOP_OFFER_SIZE = 3; // 스카우터 없을 때 기본값
export const SHOP_REROLL_COST = 50;

// 스펙 5.3절 "스태프" 효과표
export const COACH_CHEMISTRY_DECAY_BY_LEVEL = { academy: 1.5, proLicense: 1, veteran: 0.5, master: 0 };
export const SCOUT_SHOP_OFFER_SIZE_BY_LEVEL = { academy: 3, proLicense: 4, veteran: 4, master: 5 };
export const SCOUT_MASTER_REROLL_DISCOUNT = 0.5;

// GOD 카드(선수)가 상점에 뜰 확률 — 전 세계 2명뿐이라 극희귀. 1부 상점에서만
// 굴린다(data/draft-shop.mjs) - 하부리그에 최상위 카드가 섞이면 위화감이 크다.
export const GOD_PLAYER_SHOP_CHANCE = 0.005;

// 승격 전용 위기: 이적 요구가 발동할 확률 (스펙 8절, 승격 직후 시즌에만)
export const PROMOTION_TRANSFER_DEMAND_CHANCE = 0.5;

// 스펙 2절 "시즌 분할 체계" — 여름 시장(1~8주) → 전반기 → 겨울 시장(9~12주) → 후반기
export const SUMMER_MARKET_WEEKS = [1, 8];
export const WINTER_MARKET_WEEKS = [9, 12];

// 스펙 8절 "승격 보상" — 적응도 상승 속도 2배는 슬라이스에서 생략(별도 시즌 플래그 필요), 나머지 둘만 적용
export const PROMOTION_CHEMISTRY_BONUS = 5;
export const PROMOTION_FUNDS_BONUS_RATIO = 0.1;

// 스펙 3절/8절 "이벤트" — 슬라이스 범위: 일반 위기 2 + 일반 기회 3 + 승격 전용 위기 2
export const PROMOTION_TRANSFER_DEMAND_OVR_PENALTY = 5; // 거부 시 그 시즌 OVR 하락(출발값, 튜닝 대상)
export const PROMOTION_RENEWAL_HIKE_RATIO = 0.3; // 승격 전용: 재계약 비용 +30%
export const SPONSORSHIP_FUNDS_BONUS_RATIO = 0.2; // 메인 스폰서십 특수: 시작 자금 +20%
export const FA_FIRE_SALE_DISCOUNT_RATIO = -0.5; // FA 급매물 등장: 50% 할인
export const AGENT_BACKLASH_SURCHARGE_RATIO = 0.1; // 에이전트의 뒷공작: 영입비 +10%

// 스펙 2절: 기대 목표(targetPoints) 미달이 이만큼 누적되면 해임된다.
export const MISSED_TARGET_LIMIT = 3;
// 승격 못 하고 같은 리그에 계속 머무르면 시즌 지급 자금이 미달 누적 1회당
// 이만큼 깎인다(승격하면 missedTargetCount가 0으로 리셋되니 이 페널티도
// 같이 풀린다). MISSED_TARGET_LIMIT(3) 전까지만 쌓이므로 최대 -30%.
export const STAGNATION_FUNDS_PENALTY_PER_MISS = 0.15;

// 스펙 10절 명성 점수 계산안. 도달 리그 단계 x 10 + 우승 횟수 x 50.
export const REPUTATION_PER_TIER = 10;
export const REPUTATION_PER_TITLE = 50;
export const REPUTATION_PER_UCL_TITLE = 80; // 대륙 대회 우승은 리그 우승보다 희소해서 더 쳐준다

// 이사진 시즌 목표(승점) - 안전선과 승격선 사이 어디쯤에 둘지(0=안전선, 1=승격선).
// 초과 달성한 승점 1점당 다음 시즌 지급액의 1.5%(상한 30%)를 보너스로 주고,
// 한 점이라도 넘기면 적응도도 올려준다.
export const BOARD_GOAL_POSITION = 0.6;
export const BOARD_REWARD_FUNDS_PER_POINT = 0.015;
export const BOARD_REWARD_FUNDS_CAP = 0.3;
export const BOARD_REWARD_CHEMISTRY = 5;

// 시즌 이벤트 발생 확률(시즌 여름 시작 / 겨울 시장 진입). 플레이 후 조절 대상.
export const EVENT_CHANCE_SUMMER = 0.7;
export const EVENT_CHANCE_WINTER = 0.3;

// 이사진 요구 카드 달성 보상 - 다음 시즌 지급액 대비 비율(난이도별).
export const BOARD_DEMAND_REWARD = { easy: 0.05, normal: 0.10, hard: 0.20 };
