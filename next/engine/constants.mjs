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
