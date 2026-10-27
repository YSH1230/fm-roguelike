// 풋살 5 대 5 규칙 수치(v6.3). 모든 수치는 여기 한 곳에서만 정의하고, 시뮬레이션과 화면은 이 값을 읽는다.
// 좌표는 미터. 코트 40 x 20, 홈(사람) 팀은 왼쪽 골대(x=0)를 지키고 오른쪽(x=40)으로 공격한다.
export const TUNE = {
  court: { w: 40, h: 20, goalW: 3, penaltyR: 6 },
  // 시간: 풋살 20분 x 2하프를 8배 압축(실제 150초 x 2). 공이 코트 밖이면 시계 정지.
  halfClockSeconds: 1200, clockScale: 8, realMatchSeconds: 300,
  extraMinutes: { 1: [1, 5], 2: [3, 10] }, // 정규 시간 뒤 추가시간(풋살 시계, 분)
  // 이동과 공
  minRunSpeed: 6.9, maxRunSpeed: 8.1, accel: 9, // 달리기 최고 속도 능력 0/10/20에서 6.9 / 7.5 / 8.1 m/s (사용자 지시 3차 보정: 원래 6/7.5/9)
  passSpeedMin: 10, passSpeedMax: 16, passSpeedBase: 8, passSpeedPerM: 0.8, ballFriction: 0.6, pickupR: 1.2, interceptR: 0.62, blockR: 0.7,
  deadBallSeconds: 4, autoRestartSeconds: 0.9,
  // 체력
  speedFloor: 0.7, gkDelayGrow: 0.4, // 후반이 될수록 최대 30%까지 달리기가 느려진다
  stamina: { fullMatchDrain: 0.40, costK: 0.30 }, // 체력 곡선(소모율): 능력 10 선수가 5분 풀 출전하면 잔량 40% 감소, 체력 소모 배율(능력 +-30%)을 곱한다
  move: { accelK: 0.10, sharpDeg: 60, turnLoss: { base: 0.15, k: 2 / 3 }, carryLoss: { base: 0.08, k: 0.5 }, turnCooldown: 0.3 }, // 가속(속도 +-20%), 급커브 손실 25/15/5%, 공 소유 감속 12/8/4%(속도 50% + 기술 50%). sharpDeg와 turnCooldown은 임시값
  // 링(7장): 지속 시간은 ms, 체력 색 경계는 비율. 값은 지시문 7장 표. kitLumDiff는 문서에 없는 임시값(두 팀 유니폼 밝기 차이 기준).
  ring: { passMs: 300, holdMs: 250, signalMs: 400, restartMs: 4000, max: 3, staminaOrange: 0.6, staminaRed: 0.25, growMs: 250, growScale: 1.5, kitLumDiff: 0.15 },
  subThreshold: 0.25, subPopupSeconds: 3,
  // 입력(화면 px, 640 기준이 아니라 실제 손가락 px)
  // 입력(화면 px). 콕 = 20px 이하 + 250ms 이내, 꾹 = 20px 이하로 0.25초, 쓸기 = 35px 이상 + 0.5px/ms 이상. sensitivity(0.7~1.3)로 사용자가 조절한다.
  input: { tapMove: 20, leftTapMove: 20, tapMs: 250, holdMs: 250, swipePx: 35, swipeSpeed: 0.5, joyRadius: 44, deadzone: 10, buffer: 150, flipThreshold: 0.6, flipMs: 180, spotRadius: 2.4, shotAngleDeg: 55, swipePowerMin: 0.5, swipePowerMax: 2.0, powerAtMin: 0.6, powerAtMax: 1.0, sensitivity: 1 },
  // 접촉 경합, 슛
  contactR: 0.85, contestInterval: 0.45, dribbleSeconds: 0.8, dribbleBoost: 1.25,
  shot: { goalY: [8.5, 11.5], cornerOffset: 1.1, baseNoise: 0.12, rangeBase: 12, rangePerShooting: 0.45, minPower: 0.6, speedMin: 12, speedMax: 26, powerNoise: 0.35, gkReachBase: 0.9, gkReachPerHandling: 0.03, gkReachPowerCut: 0.25, gkReactBase: 0.26, gkReactPerReaction: 0.008, gkDive: 1.3 },
  // 킥 준비와 임팩트(2장): 입력 뒤 준비 시간이 지나야 공이 나간다. 준비 시간 = 능력치 연계(base는 능력치 10), 후속 모션은 고정.
  kick: {
    pass: { base: 0.050, k: 0.30, follow: 0.12 }, // 패스 능력
    shot: { base: 0.080, k: 0.30, follow: 0.18, moveMul: 0.4 }, // 슛 능력. 준비 동안 슈터 이동 속도 40%
    standing: { base: 0.050, k: 0.20, follow: 0.35 }, // 기술 능력
    sliding: { base: 0.080, k: 0.20, follow: 0.35 }, // 기술 능력
    backswingRad: 0.6, followRad: 1.0, // 모션: 준비 중 다리를 뒤로, 임팩트 뒤 앞으로
    hitstopPower: 0.7, hitstopSec: 0.033, // 슛 세기 0.7 이상이면 발사 순간 33ms 멈춤
    stumble: { base: 0.25, k: 0.30 }, // 공을 뺏긴 선수가 비틀거리는 시간(힘 연계, 문서 표의 순서 그대로: 힘이 클수록 길다)
    stumbleMoveMul: 0, // 비틀거리는 동안 이동 속도 배수(문서에 값이 없어 임시로 0, 보고 대상)
  },
  // 패스(3장): 속도는 거리 기반 x 능력 계수, 도착할 때 20% 느려진다. 먼 패스(12m 이상)와 압박(2.4m 안 상대)에서만 오차가 생긴다.
  pass: { freeFlight: 1.0, speedK: 0.10, arriveMul: 0.8, errFarDist: 12, errFar: 0.5, errPress: 0.5, pressDist: 2.4, errBase: 1.6, errPerAbility: 0.07, errMin: 0.2, errMax: 1.6, lowStamina: 0.25, lowStaminaMul: 1.25, radiusK: 0.10 },
  // 슛(4장): 쓸기 속도 → 세기, 구석 위험, 찬스 등급. 등급 기준 거리와 반경 중 문서에 없는 값은 임시값이다(보고 대상).
  chance: {
    hardDist: 14, hardDefenderR: 1.2, // 문서: 14m 이상이거나 수비수가 바짝 붙었을 때 (바짝 = 임시 1.2m)
    sureDist: 6, sureDefenderR: 3.0, gkOffAim: 1.0, // 문서: 6m 이내, 수비수 없음, 골키퍼가 자리를 못 잡았을 때 (수비수 없음 = 임시 3.0m 안에 없음, 못 잡음 = 임시 조준과 1.0m 이상 떨어짐)
    goodDist: 10, goodDefenderR: 2.5, goodGkOffAim: 0.8, // 문서: 10m 이내, 수비수가 멀고 열린 구석을 노릴 때 (멀다 = 임시 2.5m, 열린 구석 = 임시 골키퍼와 0.8m 이상)
    p: { sure: [0.50, 0.60, 0.68], good: [0.22, 0.30, 0.38], normal: [0.06, 0.10, 0.14], hard: [0.02, 0.04, 0.06] }, // 슛 능력 0 / 10 / 20의 득점 확률(문서 표)
    noiseMul: { sure: 2.0, good: 1.8, normal: 3.5, hard: 3.5 }, reachMul: { sure: 0.8, good: 0.35, normal: 1.1, hard: 1.5 }, slope: { sure: 0.15, good: 0.9, normal: 0.15, hard: 0.8 }, // slope: 슛 능력이 잡음에 미치는 영향의 크기(등급별 보정) // 시뮬레이션으로 보정하는 등급별 계수(보정 값은 이 줄을 덮어쓴다)
  },
  difficulty: { autoDefense: 'weak', chanceMul: 1.2, aiActivity: 1 }, // 수비 강도(5장), 찬스 득점 배수, 상대 AI 활동성(2단계부터 사용)
  cornerRisk: 0.5, cornerRiskSpan: 1.5, // 구석 위험: 잡음 배수 = 1 + 0.5 x (|조준 - 중앙| / 1.5)
  shotPowerK: 0.08, // 슛 최대 세기 계수 = 슛 70% + 힘 30% (±8%)
  // 수비와 태클(5장). 문서에 값이 없는 것은 임시값이고 보고 대상이다(slowMul, signal.*, defense.*).
  tackle: {
    standing: { reach: 2.0, reachK: 0.05, base: 0.35, penalty: 0.30, penaltyK: 0.30, slowMul: 0.5 }, // 콕: 닿는 거리(속도), 기본 성공률, 실패 시 느려지는 시간(힘)과 느려지는 배수(임시)
    sliding: { reach: 3.5, reachK: 0.05, mul: 0.7, freeze: 0.40, freezeK: 0.30, down: 0.80, downK: 0.15, interval: 3.0, intervalK: 0.15, staminaCost: 0.03, staminaCostK: 0.30 }, // 꾹: 성공하면 상대 정지(힘), 실패하면 누움(체력), 사용 간격(체력), 체력 3%
    bonus: 0.20, // 태클 신호가 켜진 동안 터치를 시작하면 성공률 +20%p
    pK: 0.025, pMin: 0.06, pMax: 0.65, // 성공 확률 = 기본 + 0.025 x (수비 합성값 - 공격 합성값), 0.06~0.65로 자른다
    defMix: [['strength', 0.5], ['skill', 0.3], ['speed', 0.2]], carrierMix: [['strength', 0.6], ['skill', 0.4]],
  },
  signal: { ms: 0.4, gap: 1.0, farOffset: 0.9, farCycle: 0.9, farShare: 0.25, farMinSpeed: 2, turnDeg: 90, turnWindow: 0.3, firstTouch: 0.4 }, // 태클 신호: 청록 링 0.4초, 같은 선수는 1초 간격. 나머지는 임시값
  defense: { jockey: 1.3, coverBack: 2.5, laneShare: 0.6, laneError: 3.5, laneErrorWeak: 6.5, controlIdle: 0.3, attemptPerSec: { weak: 0.01, normal: 0.05, strong: 0.12 }, signalWindow: 0.9, randomAttempt: 0.5, contactBase: 0.20 }, // 1차 수비수 간격 1.3m, 커버 2~3m 뒤, 조종 선수 AI 전환 0.3초. 시도 빈도와 contactBase는 임시/보정값
  // AI 공 가진 선수의 선택(임시값, 9장에서 지표에 맞춰 보정): 결정 간격, 압박 거리, 패스 길 여유, 슛과 패스 선택 확률
  ai: { think: [3.2, 5.4], gkThink: [1.0, 2.0], firstTouch: 0.3, pressDist: 1.6, passLane: 1.2, passMate: 2.4, pass: 0.5, passPressed: 0.6, shotP: 0.35, shotThink: 0.5, shotLane: 0.4, slack: 0.5, pressedThink: 1.2, nearOpp: 2.5, nearCos: 0.3 }, // 전부 임시/보정값(문서에 없음)
  flyingGk: { emptyNetGoal: 0.85 },
  sophistication: { skillMul: 0.7, coachMul: 2.2, max: 20, rotationMin: 16 },
  expectedGoals: 2.5, // 지시문 4장: 경기당 합계 골(두 팀 합) 기준. 설계 문서 v6.3의 '팀당 약 2.5골'과 읽는 방식이 달라 보고 대상.
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const speedOf = (a) => TUNE.minRunSpeed + (TUNE.maxRunSpeed - TUNE.minRunSpeed) * clamp(a, 0, 20) / 20;
export const effSpeed = (a, ratio) => speedOf(a) * (TUNE.speedFloor + (1 - TUNE.speedFloor) * clamp(ratio, 0, 1));
// 체력 소모: 능력 10 선수가 5분 풀 출전하면 잔량이 약 40% 줄고, 능력치별 체력 소모 배율(1.3 / 1.0 / 0.7)을 곱한다(초당)
export const drainPerSecond = (stamina) => TUNE.stamina.fullMatchDrain * link(1.0, stamina, TUNE.stamina.costK, false) / TUNE.realMatchSeconds;
// 이동(6장): 가속은 속도 능력 0/10/20에서 7.2 / 9.0 / 10.8, 급하게 꺾을 때 속도 손실 25 / 15 / 5%, 공을 들었을 때 감속 12 / 8 / 4% (속도 50% + 기술 50%)
export const accelOf = (speed) => link(TUNE.accel, speed, TUNE.move.accelK, true);
export const turnLossOf = (ab) => link(TUNE.move.turnLoss.base, mixAbility([[ab.speed ?? 10, 0.5], [ab.skill ?? 10, 0.5]]), TUNE.move.turnLoss.k, false);
export const carryLossOf = (ab) => link(TUNE.move.carryLoss.base, mixAbility([[ab.speed ?? 10, 0.5], [ab.skill ?? 10, 0.5]]), TUNE.move.carryLoss.k, false);
export const gkDelay = (base, ratio) => base * (1 + TUNE.gkDelayGrow * (1 - clamp(ratio, 0, 1)));
export const sophistication = (avgSkill, coach) => Math.min(TUNE.sophistication.max, avgSkill * TUNE.sophistication.skillMul + clamp(coach, 0, 3) * TUNE.sophistication.coachMul);
// 슛 사거리(m)와 거리별 정확도 잡음(표준편차 m)
export const shotRange = (shooting) => TUNE.shot.rangeBase + TUNE.shot.rangePerShooting * clamp(shooting, 0, 20);
export const shotNoise = (shooting, dist, slope = 0.43) => TUNE.shot.baseNoise * Math.max(0.25, dist - 4) * 1.05 * (1 + slope * (10 - clamp(shooting, 0, 20)) / 10);
// 접촉 경합: 개인기 중이면 기술+속도, 아니면 힘으로 지킨다. 수비는 힘과 속도. 수비수가 이길 확률.
export function contestDefenderWins(att, def, dribbling) {
  const a = dribbling ? (att.skill + att.speed) / 2 : att.strength;
  const d = (def.strength * 0.7 + def.speed * 0.3);
  return clamp(TUNE.defense.contactBase + 0.025 * (d - a), 0.06, 0.65);
}
export const clockText = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
// 손가락 입력 구분(지연 없이 즉시): 콕 = 35px 미만 + 250ms 이내(20~35px는 미끄러진 콕), 쓸기 = 35px 이상 + 0.5px/ms 이상, 그 밖은 없음. 꾹은 시간으로만 판정한다(futsalInput).
export function classifyGesture({ m, ms, sens = 1 }) {
  const t = TUNE.input;
  if (m >= t.swipePx / sens && m / Math.max(1, ms) >= t.swipeSpeed / sens) return 'swipe';
  if (m < t.swipePx / sens && ms <= t.tapMs) return 'tap';
  return 'none';
}
// 능력치 연계 함수 하나: V = V0 x (1 ± k x (A - 10) / 10). 클수록 좋은 값은 high=true(+), 작을수록 좋은 값은 high=false(-).
export const link = (v0, a, k, high = true) => v0 * (1 + (high ? 1 : -1) * k * (clamp(a, 0, 20) - 10) / 10);
// 여러 능력치를 비중대로 섞은 값: mixAbility([[패스, 0.7], [속도, 0.3]])
export const mixAbility = (parts) => parts.reduce((s, [a, w]) => s + a * w, 0) / parts.reduce((s, [, w]) => s + w, 0);
// 스와이프 속도(px/ms) 0.5~2.0 → 세기 0.6~1.0 (선형)
export const swipePower = (v) => { const T = TUNE.input; const k = clamp((v - T.swipePowerMin) / (T.swipePowerMax - T.swipePowerMin), 0, 1); return T.powerAtMin + (T.powerAtMax - T.powerAtMin) * k; };
export const passSpeedFor = (dist) => clamp(TUNE.passSpeedBase + dist * TUNE.passSpeedPerM, TUNE.passSpeedMin, TUNE.passSpeedMax);
// 골키퍼가 손이 닿는 범위(m): 핸들링이 높을수록 넓고, 세게 찬 슛일수록 좁다
export const gkReach = (handling, power) => (TUNE.shot.gkReachBase + TUNE.shot.gkReachPerHandling * clamp(handling, 0, 20)) * (1 - TUNE.shot.gkReachPowerCut * power);
// 골키퍼 반응 시간(초): 반응 능력이 높을수록 짧고, 지치면 늘어난다
export const gkReactTime = (reaction, ratio) => gkDelay(Math.max(0.08, TUNE.shot.gkReactBase - TUNE.shot.gkReactPerReaction * clamp(reaction, 0, 20)), ratio);

// 킥 준비 시간(초): kind = 'pass' | 'shot' | 'standing' | 'sliding'. 연계 능력치는 패스 / 슛 / 기술 / 기술.
export function kickPrep(kind, ab) {
  const c = TUNE.kick[kind];
  const a = kind === 'pass' ? (ab.passing ?? ab.skill ?? 10) : kind === 'shot' ? (ab.shooting ?? 10) : (ab.skill ?? 10);
  return link(c.base, a, c.k, false);
}
export const stumbleTime = (strength) => link(TUNE.kick.stumble.base, strength, TUNE.kick.stumble.k, true);

// ---- 패스 능력 연계(3장) ----
export const passSpeedCoef = (passing) => link(1.0, passing, TUNE.pass.speedK, true); // 0.9 / 1.0 / 1.1배
// 출발 속도: 거리 기반 속도 x 능력 계수, 곱한 뒤에도 passSpeedMin(10m/s) 아래로 내려가지 않는다
export const passV0 = (dist, passing) => Math.max(TUNE.passSpeedMin, passSpeedFor(dist) * passSpeedCoef(passing));
// 패스 오차의 능력 계수 = 1.6 - 0.07 x 패스(0.2~1.6): 패스 0이면 1.6배, 10이면 0.9배, 20이면 0.2배
export const passErrorCoef = (passing) => clamp(TUNE.pass.errBase - TUNE.pass.errPerAbility * passing, TUNE.pass.errMin, TUNE.pass.errMax);
// 패스 오차의 표준편차(m): 먼 패스 +0.5, 압박 +0.5(합산), x 능력 계수, 체력 25% 이하면 x1.25
export function passErrorSigma({ dist, pressed, passing, ratio }) {
  const P = TUNE.pass;
  const base = (dist >= P.errFarDist ? P.errFar : 0) + (pressed ? P.errPress : 0);
  return base * passErrorCoef(passing) * (ratio <= P.lowStamina ? P.lowStaminaMul : 1);
}
// 판정 반경: 가로채기 = 패스 70% + 속도 30%(±10%), 공 받기 = 패스(±10%)
export const interceptRadius = (ab) => link(TUNE.interceptR, mixAbility([[ab.passing ?? 10, 0.85], [ab.speed ?? 10, 0.15]]), TUNE.pass.radiusK, true);
export const pickupRadius = (ab) => link(TUNE.pickupR, ab.passing ?? 10, TUNE.pass.radiusK, true);

// ---- 슛 능력 연계(4장) ----
export const shotPowerCoef = (ab) => link(1.0, mixAbility([[ab.shooting ?? 10, 0.7], [ab.strength ?? 10, 0.3]]), TUNE.shotPowerK, true); // 0.92 / 1.00 / 1.08
export const cornerRisk = (aim, center = 10) => 1 + TUNE.cornerRisk * (Math.abs(aim - center) / TUNE.cornerRiskSpan); // 중앙 1.0배, 골포스트 옆 약 1.5배
// 찬스 등급별 득점 확률 목표(슛 능력 0/10/20 사이를 선형 보간) x 전체 배수
export function chanceTarget(grade, shooting, mul = TUNE.difficulty.chanceMul) {
  const [a, b, c] = TUNE.chance.p[grade]; const s = clamp(shooting, 0, 20);
  const v = s <= 10 ? a + (b - a) * (s / 10) : b + (c - b) * ((s - 10) / 10);
  return clamp(v * mul, 0, 0.95);
}

// ---- 태클(5장) ----
export const standingReach = (ab) => link(TUNE.tackle.standing.reach, ab.speed ?? 10, TUNE.tackle.standing.reachK, true); // 1.8 / 2.0 / 2.2m
export const slidingReach = (ab) => link(TUNE.tackle.sliding.reach, ab.speed ?? 10, TUNE.tackle.sliding.reachK, true); // 3.15 / 3.5 / 3.85m
export const standingPenalty = (strength) => link(TUNE.tackle.standing.penalty, strength, TUNE.tackle.standing.penaltyK, false); // 0.39 / 0.30 / 0.21초
export const slidingFreeze = (strength) => link(TUNE.tackle.sliding.freeze, strength, TUNE.tackle.sliding.freezeK, true); // 0.28 / 0.40 / 0.52초
export const slidingDown = (stamina) => link(TUNE.tackle.sliding.down, stamina, TUNE.tackle.sliding.downK, false); // 0.92 / 0.80 / 0.68초
export const slidingInterval = (stamina) => link(TUNE.tackle.sliding.interval, stamina, TUNE.tackle.sliding.intervalK, false); // 3.45 / 3.00 / 2.55초
export const staminaCostMul = (stamina) => link(1.0, stamina, 0.30, false); // 체력 소모 배율 1.3 / 1.0 / 0.7
// 태클 성공 확률: 기본 + 0.025 x (수비 합성값 - 공 가진 선수 합성값) (+ 신호 보너스), 0.06~0.65. 슬라이딩은 신호 보너스를 더한 뒤 x0.7.
export function tackleChance(carrier, defender, { slide = false, signal = false } = {}) {
  const T = TUNE.tackle; const d = mixAbility(T.defMix.map(([k, w]) => [defender[k] ?? 10, w])); const a = mixAbility(T.carrierMix.map(([k, w]) => [carrier[k] ?? 10, w]));
  const p = clamp(T.standing.base + T.pK * (d - a) + (signal ? T.bonus : 0), T.pMin, T.pMax);
  return slide ? p * T.sliding.mul : p;
}
