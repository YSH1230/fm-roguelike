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
export const LEAGUE_POINTS_COEFFICIENT = 2.5;
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
