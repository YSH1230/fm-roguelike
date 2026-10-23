// 풋살 5 대 5 규칙 수치(v6.3). 모든 수치는 여기 한 곳에서만 정의하고, 시뮬레이션과 화면은 이 값을 읽는다.
// 좌표는 미터. 코트 40 x 20, 홈(사람) 팀은 왼쪽 골대(x=0)를 지키고 오른쪽(x=40)으로 공격한다.
export const TUNE = {
  court: { w: 40, h: 20, goalW: 3, penaltyR: 6 },
  // 시간: 풋살 20분 x 2하프를 8배 압축(실제 150초 x 2). 공이 코트 밖이면 시계 정지.
  halfClockSeconds: 1200, clockScale: 8, realMatchSeconds: 300,
  extraMinutes: { 1: [1, 5], 2: [3, 10] }, // 정규 시간 뒤 추가시간(풋살 시계, 분)
  // 이동과 공
  minRunSpeed: 6, maxRunSpeed: 8, accel: 9,
  passSpeedMin: 10, passSpeedMax: 16, passSpeedBase: 8, passSpeedPerM: 0.8, ballFriction: 0.6, pickupR: 1.2, interceptR: 0.85, blockR: 0.7,
  deadBallSeconds: 4, autoRestartSeconds: 0.9,
  // 체력
  drainBase: 0.55, drainPerStamina: 0.015, speedFloor: 0.7, gkDelayGrow: 0.4,
  ringTauMax: 0.5, ring: { green: [2.2, 2.4], yellow: [1.2, 1.4] },
  subThreshold: 0.25, subPopupSeconds: 3,
  // 입력(화면 px, 640 기준이 아니라 실제 손가락 px)
  // 입력(화면 px). 콕 = 20px 이하 + 250ms 이내, 꾹 = 20px 이하로 0.25초, 쓸기 = 35px 이상 + 0.5px/ms 이상. sensitivity(0.7~1.3)로 사용자가 조절한다.
  input: { tapMove: 20, leftTapMove: 20, tapMs: 250, holdMs: 250, swipePx: 35, swipeSpeed: 0.5, joyRadius: 44, deadzone: 10, buffer: 150, flipThreshold: 0.6, flipMs: 180, spotRadius: 2.4, shotAngleDeg: 55, swipePowerMin: 0.5, swipePowerMax: 2.0, powerAtMin: 0.6, powerAtMax: 1.0, sensitivity: 1 },
  // 접촉 경합, 슛
  contactR: 0.85, contestInterval: 0.45, dribbleSeconds: 0.8, dribbleBoost: 1.25,
  shot: { goalY: [8.5, 11.5], cornerOffset: 1.1, baseNoise: 0.12, rangeBase: 8, rangePerShooting: 0.45, minPower: 0.6, speedMin: 12, speedMax: 26, powerNoise: 0.35, gkReachBase: 0.9, gkReachPerHandling: 0.03, gkReachPowerCut: 0.25, gkReactBase: 0.26, gkReactPerReaction: 0.008, gkDive: 1.3 },
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
  pass: { speedK: 0.10, arriveMul: 0.8, errFarDist: 12, errFar: 0.5, errPress: 0.5, pressDist: 2.4, errBase: 1.6, errPerAbility: 0.07, errMin: 0.2, errMax: 1.6, lowStamina: 0.25, lowStaminaMul: 1.25, radiusK: 0.10 },
  flyingGk: { emptyNetGoal: 0.85 },
  sophistication: { skillMul: 0.7, coachMul: 2.2, max: 20, rotationMin: 16 },
  expectedGoals: 2.5,
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const speedOf = (a) => TUNE.minRunSpeed + (TUNE.maxRunSpeed - TUNE.minRunSpeed) * clamp(a, 0, 20) / 20;
export const effSpeed = (a, ratio) => speedOf(a) * (TUNE.speedFloor + (1 - TUNE.speedFloor) * clamp(ratio, 0, 1));
// 5분 풀 출전 소모 = 55% - 1.5% x 체력 (초당)
export const drainPerSecond = (stamina) => (TUNE.drainBase - TUNE.drainPerStamina * clamp(stamina, 0, 20)) / TUNE.realMatchSeconds;
export const ringTau = (stamina, ratio) => TUNE.ringTauMax * (clamp(stamina, 0, 20) / 20) * clamp(ratio, 0, 1);
export function ringColor(laneDist, mateDist) {
  const { green, yellow } = TUNE.ring;
  if (laneDist >= green[0] && mateDist >= green[1]) return 'green';
  if (laneDist >= yellow[0] && mateDist >= yellow[1]) return 'yellow';
  return 'red';
}
export const gkDelay = (base, ratio) => base * (1 + TUNE.gkDelayGrow * (1 - clamp(ratio, 0, 1)));
export const sophistication = (avgSkill, coach) => Math.min(TUNE.sophistication.max, avgSkill * TUNE.sophistication.skillMul + clamp(coach, 0, 3) * TUNE.sophistication.coachMul);
// 슛 사거리(m)와 거리별 정확도 잡음(표준편차 m)
export const shotRange = (shooting) => TUNE.shot.rangeBase + TUNE.shot.rangePerShooting * clamp(shooting, 0, 20);
export const shotNoise = (shooting, dist) => TUNE.shot.baseNoise * Math.max(0.25, dist - 4) * (1.5 - clamp(shooting, 0, 20) / 20 * 0.9);
// 접촉 경합: 개인기 중이면 기술+속도, 아니면 힘으로 지킨다. 수비는 힘과 속도. 수비수가 이길 확률.
export function contestDefenderWins(att, def, dribbling) {
  const a = dribbling ? (att.skill + att.speed) / 2 : att.strength;
  const d = (def.strength * 0.7 + def.speed * 0.3);
  return clamp(0.3 + 0.025 * (d - a), 0.06, 0.65);
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
export const interceptRadius = (ab) => link(TUNE.interceptR, mixAbility([[ab.passing ?? 10, 0.7], [ab.speed ?? 10, 0.3]]), TUNE.pass.radiusK, true);
export const pickupRadius = (ab) => link(TUNE.pickupR, ab.passing ?? 10, TUNE.pass.radiusK, true);
