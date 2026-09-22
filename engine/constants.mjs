// 스펙 5.1절 "플레이스타일 태그 8종" 표
export const PLAYSTYLE_TAGS = {
  gegenpressing: { positions: ['ST', 'CMF'], tier3: 4, tier5: 7 },
  falseNine: { positions: ['W', 'AMF'], tier3: 4, tier5: 7 },
  longBallKickAndRush: { positions: ['ST', 'AMF'], tier3: 4, tier5: 7 },
  tikiTaka: { positions: ['CMF', 'AMF'], tier3: 3, tier5: 5 },
  totalFootball: { positions: ['WB', 'CMF'], tier3: 3, tier5: 6 },
  falseFullBack: { positions: ['WB', 'CB'], tier3: 3, tier5: 5 }, // 변형 3백
  buildUpFromBack: { positions: ['CB', 'GK'], tier3: 2, tier5: 4 }, // 후방 빌드업
  counterAttack: { positions: ['W', 'ST'], tier3: 2, tier5: 4 }, // 선수비 후역습
};

// 스펙 5.1절 "대륙 태그 5종" 표 — 포지션 무관, 5개 권역 동일 수치
export const CONTINENT_TAGS = {
  europe: { tier3: 3, tier5: 5 },
  southAmerica: { tier3: 3, tier5: 5 },
  africa: { tier3: 3, tier5: 5 },
  asiaOceania: { tier3: 3, tier5: 5 },
  northCentralAmerica: { tier3: 3, tier5: 5 },
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

// 40 미만 ×0.95, 40~95 ×1.00~×1.04 선형, 96 이상 ×1.12
export const CHEMISTRY_LOW_THRESHOLD = 40;
export const CHEMISTRY_HIGH_THRESHOLD = 96;
export const CHEMISTRY_LOW_MULTIPLIER = 0.95;
export const CHEMISTRY_MID_MULTIPLIER_AT_LOW = 1.00;
export const CHEMISTRY_MID_MULTIPLIER_AT_HIGH = 1.04;
export const CHEMISTRY_HIGH_MULTIPLIER = 1.12;

// 스펙 12절 "미확정 사항" — 시뮬레이터로 조정할 튜닝 상수.
// 여기서는 브레인스토밍에서 제시된 출발값을 그대로 코드 상수로 둔다.
export const TEAM_MULTIPLIER_CAP = 1.30;
// node tune-check(실측)로 확인: 2.5는 OVR 우위를 승점으로 너무 크게 증폭시켜
// 5부에서 거의 항상 만점(114점) 우승이 나옴 — 2.0으로 완화.
export const LEAGUE_POINTS_COEFFICIENT = 2.0;
export const BASE_POINTS_AT_LEAGUE_AVERAGE = 42;
export const POWER_VARIANCE_RATIO = 0.05;

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
export const MANAGER_PRICE_TABLE = {
  rookie: [50, 150],
  tactician: [200, 500],
  legendary: [800, 1500],
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

export const CONTRACT_RENEWAL_RATIO = { 1: 0.3, 2: 0.6 }; // 재계약 연장 연수 → 원가 비율

// 방출 회수율: 즉시 0%, 이적명단(여름/겨울 범위), Week12 데드라인 40%
export const RELEASE_RECOVERY_IMMEDIATE = 0;
export const RELEASE_RECOVERY_LISTED_SUMMER = [0.5, 1.0];
export const RELEASE_RECOVERY_LISTED_WINTER = [0.7, 1.1];
export const RELEASE_RECOVERY_DEADLINE = 0.4;

export const STARTING_FUNDS_TIER5 = 1000;
export const FUNDS_MULTIPLIER_PER_LEAGUE_TIER = 1.5;
export const CARRYOVER_CAP_RATIO = 0.3; // 이월 자금 상한 = 다음 시즌 시작 자금의 30%

// 스펙 7절 "드래프트(상점형)"
export const SHOP_OFFER_SIZE = 3; // 스카우터 없을 때 기본값
export const SHOP_REROLL_COST = 50;

// 스펙 5.3절 "스태프" 효과표
export const COACH_CHEMISTRY_DECAY_BY_LEVEL = { academy: 1.5, proLicense: 1, veteran: 0.5, master: 0 };
export const SCOUT_SHOP_OFFER_SIZE_BY_LEVEL = { academy: 3, proLicense: 4, veteran: 4, master: 5 };
export const SCOUT_MASTER_REROLL_DISCOUNT = 0.5;

// GOD 카드(선수)가 상점에 뜰 확률 — 전 세계 2명뿐이라 극희귀
export const GOD_PLAYER_SHOP_CHANCE = 0.02;

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
