// 하이라이트 장면 규칙(순수 함수). 화면 코드는 이 값만 읽는다. 모든 수치는 TUNE 한 곳에 모은다(시연하며 고친다).
// 능력 눈금은 0~20. 설계 개정안(2026-10-18) 4절을 따른다.
export const TUNE = {
  lanes: 5, // 좌우 레인 수(레인 컷은 한 칸씩 이동)
  laneCutCooldown: 1, // 초
  sprintMul: 1.5, sprintTime: 2,
  skillCooldown: 2,
  chooseTimeBase: 3, chooseTimePerVision: 0.05, // 첫 선택 제한 시간(시야가 길게 만든다)
  frontDefenders: { own: 2, opp: 4 }, // 깊이(우리 진영 ↔ 상대 진영)에 따른 앞 수비수 수
  runnerSpeedBase: 0.5, runnerSpeedPerSkill: 0.04, // 한 장면 길이(0~1)를 1초에 달리는 비율
  chaserBase: 0.28, chaserPerDefense: 0.012,
  shootTimeBase: 4, shootTimeFinishBonus: 1, // 슛 제한 시간(초)
  wingShotPenalty: 0.8, // 윙 직접 슛(감아차기) 구간 폭 배율
  shoulderTaps: { wingRun: 3, overlap: 4 },
  gaugeCycle: 1.0, // 게이지가 한쪽 끝까지 가는 시간(초, 실시간). 슬로우와 무관하게 실시간으로 센다
  fatigueD: 0.35, // 체력 감쇠 상수

  // ---- v3 연속 공격 ----
  // 첫 패스: 압박 도달 = 3.0 + 0.05 x 활동량. 창은 압박 3.2초 기준 값이고 도달 시간에 비례해 늘고 준다
  pressBase: 3.0, pressPerActivity: 0.05, windowRef: 3.2,
  windows: { WB: [0.4, 1.4], WG: [1.1, 2.1], ST: [2.0, 3.0] },
  visionPreview: 0.4, visionWiden: 0.1, // 시야 20: 링이 +0.4초 일찍, 창 +10%
  oppDefNarrow: 0.015, // 상대 수비력 1당 창이 좁아지는 비율
  candSpeed: { WB: 34, WG: 30, ST: 52 }, // 후보가 달리는 속도(월드 단위/초)
  // 조준(새총)
  aimSlow: 0.35, aimMax: 2.0, aimAngle: 24, aimLowPull: 55, aimMinPull: 14, lobTime: { low: 0.45, loft: 0.8 },
  slowShot: 0.3, // 정밀 슛, 헤더 중 월드 속도(게이지는 실시간)
  // 달리기: 월드 75단위/초 x 줌 1.7 x 캔버스 2배 = 화면 약 255~300px/초
  runSpeed: 75, runPerSpeed: 0.01, runLat: 65, runAccel: 0.12, latCost: 0.6, // latCost: 옆 속도가 앞 속도를 깎는 정도(1이면 전체 속도 일정)
  threatFirst: 1.4, threatGap: [0.8, 1.0], warnLead: 1.0, windup: 0.25, contactR: 14, defSpeedMul: [0.9, 1.05], lungeMax: 1.3,
  pressGap0: 0.34, pressMul: 1.0, pressCatchUp: 1.6, vignetteGap: 0.14, nearMiss: 24,
  looseTime: 0.8, looseTarget: 0.6, looseStop: 0.3, looseBase: 0.06, loosePerDribble: 0.008,
  skillCD: 0.8, skillStall: 0.15, skillVoid: 0.6, skillSlow: 0.12, skillHitstop: 0.05,
  // 슛
  rangeBase: 60, rangePerShot: 5, rangeWindow: 2.0, rangeMulMax: 1.3, rangeMulMin: 0.5,
  instantRatio: 0.5, preciseBase: 0.35, precisePerShot: 0.015,
  headerTime: 1.0, headerPeak: 0.7, headerBase: 0.08, headerPerFin: 0.012, headerCenter: 0.35,
  shotFlight: 0.35, goalHold: 1.5, otherHold: 0.5,
  // 입력 구분
  tapMove: 12, tapMs: 250, flickPx: 28, flickSpeed: 0.5,
  // 경기
  possessions: 20, halftimeAfter: 5, baseGoal: 0.13, autoGoalFactor: 0.9, autoConcedeFactor: 1.1, autoHold: 0.5,
  stance: { attack: { m: 1.5, opp: 1.5 }, balanced: { m: 1, opp: 1 }, defense: { m: 0.67, opp: 0.67 } },
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

// 첫 선택 제한 시간(초): 시야가 높을수록 압박수가 느려 고를 시간이 늘어난다.
export const chooseTime = (vision) => TUNE.chooseTimeBase + clamp(vision, 0, 20) * TUNE.chooseTimePerVision;

// 앞 수비수 수: 깊이 0(우리 진영) → 2명, 1(상대 진영) → 4명, 상대 수비력이 높으면 하나 더 늘 수 있다.
export function frontDefenderCount(depth01, oppDefense) {
  const base = lerp(TUNE.frontDefenders.own, TUNE.frontDefenders.opp, clamp(depth01, 0, 1));
  return clamp(Math.round(base + (oppDefense - 10) / 20), 1, 5);
}

// 달리기 소모 배율: 깊이가 우리 진영일수록 크다(1.5 → 0.7).
export const runCostMul = (depth01) => lerp(1.5, 0.7, clamp(depth01, 0, 1));

// 체력 효과: 진행 장면과 달린 장면 수가 쌓일수록 속도·패스 거리·반응이 약해진다. (기술 능력은 영향받지 않는다)
export function fatigue(base, { scene, stamina, ranScenes = 0, c = 1 }) {
  const k = Math.min(20, scene + c * ranScenes);
  return base * (1 - (k / 20) * TUNE.fatigueD * (1 - clamp(stamina, 0, 20) / 20));
}

// 달리는 선수의 속도(장면 길이의 몇 %를 1초에 가는지), 추격수 속도
export const runnerSpeed = (speed) => TUNE.runnerSpeedBase + clamp(speed, 0, 20) * TUNE.runnerSpeedPerSkill;
export const chaserSpeed = (oppDefense, depth01) => (TUNE.chaserBase + clamp(oppDefense, 0, 20) * TUNE.chaserPerDefense) * lerp(0.9, 1.15, clamp(depth01, 0, 1));

// 개인기: 앞 수비수를 제치는 판정 창(초). 드리블이 높을수록 넓다.
export const skillWindow = (dribble) => 0.25 + clamp(dribble, 0, 20) * 0.02;

// 새총 패스 최대 거리(화면 높이 대비 0~1): 패스 능력과 체력 감소가 정한다.
export const slingRange = (pass, stamina, scene) => fatigue(0.45 + clamp(pass, 0, 20) * 0.02, { scene, stamina });

// 슛 제한 시간: 스트라이커는 결정력이 높을수록 최대 +1초.
export const shootTime = (finishing = 0, isStriker = false) => TUNE.shootTimeBase + (isStriker ? (clamp(finishing, 0, 20) / 20) * TUNE.shootTimeFinishBonus : 0);

// 왕복 게이지 값(0~1): t초에 어디에 있는가
export const gaugeAt = (t, cycle = TUNE.gaugeCycle) => {
  const p = (t / cycle) % 2;
  return p <= 1 ? p : 2 - p;
};

// 슛 세기 창: [low, high] (0~1 게이지). 슈팅이 높을수록 넓고, 윙의 직접 슛은 폭에 0.8배 불리함이 붙는다.
export function powerWindow(shooting, { curl = false, mul = 1 } = {}) {
  const w = (0.12 + (clamp(shooting, 0, 20) / 20) * 0.2) * (curl ? TUNE.wingShotPenalty : 1) * mul;
  return [0.65 - w / 2, 0.65 + w / 2];
}

// 방향 게이지(0~1) → 골대 위치(-1 왼쪽 포스트 ~ +1 오른쪽 포스트). 감아차기는 먼 포스트 쪽 구석에 치우친다.
export const aimOf = (g) => g * 2.4 - 1.2;

// 슛 결과: 'goal' | 'save' | 'post' | 'miss'. farSide: 감아차기일 때 알맞은 구석(-1 또는 1).
export function resolveShot({ power, aim, shooting, curl = false, farSide = 1, mul = 1 }) {
  const [lo, hi] = powerWindow(shooting, { curl, mul });
  if (power < lo) return 'save'; // 너무 약하면 키퍼가 막는다
  if (power > hi) return 'miss'; // 너무 세면 뜬다
  const a = Math.abs(aim);
  if (a > 1.05) return 'miss';
  if (a > 0.95) return 'post';
  if (curl) return aim * farSide > 0.45 ? 'goal' : (a < 0.45 ? 'save' : 'save');
  return a >= 0.45 ? 'goal' : 'save';
}

// ---- 수비 ----
// 어깨싸움 박자 간격(초): 상대 팀 공격력이 높을수록 빠르다.
export const shoulderInterval = (oppAttack) => 0.9 - clamp(oppAttack, 0, 20) * 0.02;
// 어깨싸움 허용 오차(초): 내 속도가 높을수록 넓다.
export const shoulderTolerance = (speed) => 0.06 + clamp(speed, 0, 20) * 0.004;
// 놓칠 때마다 간격이 한 단계씩 벌어진다(0~3).
export const widenGap = (gap) => Math.min(3, gap + 1);

// 마무리 막기 창: 전체 폭은 간격이 정하고(붙었을수록 넓음), 중앙(완벽 차단) 폭은 태클이 정한다. 간격이 가장 벌어져도 가장자리만 있는 아주 좁은 창이 남는다.
export function finishBlockWindow(gap, tackle) {
  const total = 0.12 + (3 - gap) * 0.06;
  const center = gap >= 3 ? 0 : (clamp(tackle, 0, 20) / 20) * 0.1 + 0.02;
  return { total, center: Math.min(center, total * 0.6) };
}

// 막대(0~1)에서 창 중앙(0.5) 기준 판정: 'perfect' | 'partial' | 'miss'
export function blockResult(pos, win) {
  const d = Math.abs(pos - 0.5);
  if (win.center > 0 && d <= win.center / 2) return 'perfect';
  if (d <= win.total / 2) return 'partial';
  return 'miss';
}

// 골키퍼 다이빙 창 폭: 반응이 정한다(체력 감소 적용). 위치는 슛이 날아오는 속도를 늦춘다.
export const diveWindow = (reaction, scene = 0, stamina = 10) => 0.1 + (fatigue(clamp(reaction, 0, 20), { scene, stamina }) / 20) * 0.2;
export const shotFlightTime = (position, oppAttack) => 0.9 + clamp(position, 0, 20) * 0.02 - clamp(oppAttack, 0, 20) * 0.01;

// 수비 4등급
export const DEFENSE_GRADES = ['perfect', 'partial', 'crisis', 'goal'];

// ---- v3: 첫 패스, 달리기, 슛 규칙 ----
export const pressArrival = (activity) => TUNE.pressBase + clamp(activity, 0, 20) * TUNE.pressPerActivity;
// 후보의 열림 창(월드 초). 압박 도달 시간에 비례하고, 시야는 링이 일찍 보이게 하며 창을 넓히고, 상대 수비력은 좁힌다.
export function openWindow(role, { arrival, vision, oppDef, easy = 1 }) {
  const [o, c] = TUNE.windows[role];
  const k = arrival / TUNE.windowRef;
  const widen = 1 + TUNE.visionWiden * (clamp(vision, 0, 20) / 20);
  const narrow = clamp(1 - (oppDef - 10) * TUNE.oppDefNarrow, 0.6, 1.3);
  const width = (c - o) * k * widen * narrow * easy;
  const open = o * k;
  return { open, close: open + width, warn: 0.5 + TUNE.visionPreview * (clamp(vision, 0, 20) / 20) };
}
// 슛 유효 사거리(골라인에서 월드 단위)와 거리 배율
export const shotRange = (shooting) => TUNE.rangeBase + clamp(shooting, 0, 20) * TUNE.rangePerShot;
export const rangeMul = (dist, range) => clamp(1.3 - 0.8 * (dist / range), TUNE.rangeMulMin, TUNE.rangeMulMax);
// 정밀 슛 골 확률의 기대값(숙련 플레이어)과 즉발 슛(그 절반)
export const preciseExpect = (shooting, mul = 1) => clamp((TUNE.preciseBase + clamp(shooting, 0, 20) * TUNE.precisePerShot) * mul, 0.02, 0.95);
export const instantGoalProb = (shooting, mul = 1) => preciseExpect(shooting, mul) * TUNE.instantRatio;
// 헤더 창 폭(초): 결정력이 정한다
export const headerWindow = (finishing, mul = 1) => (TUNE.headerBase + clamp(finishing, 0, 20) * TUNE.headerPerFin) * mul;
// 개인기를 쓰고 접촉을 무효로 하는 창, 루즈볼 확보 창(초)
export const looseWindow = (dribble, easy = 1) => (TUNE.looseBase + clamp(dribble, 0, 20) * TUNE.loosePerDribble) * easy;
export const runSpeedOf = (speed) => TUNE.runSpeed * (0.9 + clamp(speed, 0, 20) * TUNE.runPerSpeed);
// 내 공격 확률(4.2절)과 상대 자동 공격 득점 확률
export const pAttack = ({ me, opp, m = 1 }) => { const x = m * (me.atk / opp.def); const y = opp.atk / me.def; return x / (x + y); };
export const autoGoalProb = ({ oppAtk, myDef, gk = 10, stance = 'balanced' }) => clamp(TUNE.baseGoal * (oppAtk / Math.max(1, myDef)) * TUNE.stance[stance].opp * (1 - (gk - 10) * 0.01), 0.02, 0.6);

// 손가락 입력 구분(지연 없이 즉시 판정): 탭 = 이동 12px 이내 + 250ms 이내, 플릭 = 28px 이상 + 속도 0.5px/ms 이상, 그 밖은 옆으로 틀기(드래그)
export function classifyGesture({ m, ms }) {
  if (m <= TUNE.tapMove && ms <= TUNE.tapMs) return 'tap';
  if (m >= TUNE.flickPx && m / Math.max(1, ms) >= TUNE.flickSpeed) return 'flick';
  return 'drag';
}
