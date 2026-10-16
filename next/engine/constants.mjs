export const POSITIONS = ['GK', 'DF', 'MF', 'FW'];

// 포지션별 핵심 속성 4개(0~100)
export const ATTRIBUTES = {
  GK: ['reflexes', 'handling', 'positioning', 'stamina'],
  DF: ['tackling', 'marking', 'heading', 'stamina'],
  MF: ['passing', 'vision', 'workrate', 'stamina'],
  FW: ['shooting', 'pace', 'dribbling', 'stamina'],
};

// 한 시즌: 20팀 더블 라운드로빈 38라운드를 14/14/10 구간으로 끊는다.
export const SEASON = { teams: 20, rounds: 38, chunks: [14, 14, 10] };

// 팀 전력(공격력·수비력). 코치 별 1개당 기본 12점, 스타 한 명이 더하는 최대 8점.
export const COACH_BASE_PER_STAR = 12;
export const STAR_MAX_BONUS = 8;

// 기대 득점: BASE * boost * exp((공격-상대수비)/50). 공격=수비면 1.3골.
export const BASE_GOALS = 1.3;
export const HOME_BOOST = 1.1;
export const GOAL_SCALE = 50;
export const ASSIST_CHANCE = 0.7;

// 득점·도움을 누가 할지의 포지션 가중치
export const SCORER_POS_WEIGHT = { FW: 5, MF: 2.5, DF: 0.7, GK: 0.02 };
export const ASSIST_POS_WEIGHT = { FW: 3, MF: 4, DF: 1, GK: 0.05 };

// ---- 계획 2: 선수 확보 ----
export const ROSTER_STARS = 6;
export const CONTRACT_YEARS = 3;
// 샐러리캡(스타 연봉 총액 한도), 리그 단계(1=1부)별
export const SALARY_CAP = { 3: 100, 2: 150, 1: 200 };
export const DRAFT_SIZE = 20;
export const ROOKIE_DISCOUNT = 0.6;
export const FA_FRESH = 6;
export const FA_RELEASED = 4;
export const RESIGN_MIN_MOOD = 40;
export const TRADE_MARGIN = 1.1; // AI는 받는 가치가 주는 가치의 1.1배 이상일 때만 수락
export const TRADE_MIN_MOOD = 30; // 사기가 이보다 낮은 선수는 AI가 받지 않는다
export const AI_NAMED_MAX = 3;

// ---- 계획 3: 경제 ----
export const START_COINS = 30;
export const START_FANS = 20; // 팬 지수 0~100
export const FACILITY_KINDS = ['stadium', 'training', 'rehab'];
export const FACILITY_MAX = 10;
export const FACILITY_COST_STEP = 10; // n단계로 올리는 비용 = 10 x n 코인
export const CAP_STEP = 10; // 캡 확장 1회당 늘어나는 캡 포인트
export const CAP_EXPANSIONS_MAX = 5;
export const CAP_COST_STEP = 20; // n번째 확장 비용 = 20 x n 코인
// 리그 단계(1=1부)별 수입
export const WIN_INCOME = { 3: 5, 2: 8, 1: 12 };
export const CHAMPION_PRIZE = { 3: 50, 2: 100, 1: 200 };
export const FAN_INCOME_SCALE = 2; // 홈경기 수입 = 경기장 단계 x 팬 지수/100 x 2
export const FAN_PER_RESULT = 0.3; // 구간마다 (승 - 패) x 0.3 만큼 팬 지수 변화
export const COACH_COST_FACTOR = 6; // 코치 계약 비용 = 6 x 별^2 코인(3년 계약 한 번에)
// 훈련 강도: xp 배율, 컨디션 소모 배율, 사기 변화, 부상 배율
export const INTENSITIES = {
  LIGHT: { xp: 0.8, fatigue: 0.7, mood: 1, injury: 0.8 },
  NORMAL: { xp: 1, fatigue: 1, mood: 0, injury: 1 },
  HARD: { xp: 1.25, fatigue: 1.4, mood: -2, injury: 1.3 },
};
// 코치 특성: xp 배율, 사기 가산, 부상 배율
export const TRAITS = {
  strict: { label: '엄격함', xp: 1.1, mood: -1, injury: 1 },
  motivator: { label: '동기부여', xp: 1, mood: 1, injury: 1 },
  tactician: { label: '전술가', xp: 1.15, mood: 0, injury: 1.1 },
  caretaker: { label: '관리형', xp: 0.95, mood: 0, injury: 0.8 },
};
