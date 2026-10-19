// 풋살 5 대 5 규칙 수치(v6.3). 모든 수치는 여기 한 곳에서만 정의하고, 시뮬레이션과 화면은 이 값을 읽는다.
// 좌표는 미터. 코트 40 x 20, 홈(사람) 팀은 왼쪽 골대(x=0)를 지키고 오른쪽(x=40)으로 공격한다.
export const TUNE = {
  court: { w: 40, h: 20, goalW: 3, penaltyR: 6 },
  // 시간: 풋살 20분 x 2하프를 8배 압축(실제 150초 x 2). 공이 코트 밖이면 시계 정지.
  halfClockSeconds: 1200, clockScale: 8, realMatchSeconds: 300,
  extraMinutes: { 1: [1, 5], 2: [3, 10] }, // 정규 시간 뒤 추가시간(풋살 시계, 분)
  // 이동과 공
  minRunSpeed: 6, maxRunSpeed: 8, accel: 9,
  passSpeed: 15, shotSpeed: 22, ballFriction: 0.6, pickupR: 0.9, interceptR: 0.75, blockR: 0.7,
  deadBallSeconds: 4, autoRestartSeconds: 0.9,
  // 체력
  drainBase: 0.55, drainPerStamina: 0.015, speedFloor: 0.7, gkDelayGrow: 0.4,
  ringTauMax: 0.5, ring: { green: [2.2, 2.4], yellow: [1.2, 1.4] },
  subThreshold: 0.25, subPopupSeconds: 3,
  // 입력(화면 px, 640 기준이 아니라 실제 손가락 px)
  input: { tapMove: 12, tapMs: 250, flickPx: 28, flickSpeed: 0.5, joyRadius: 44, deadzone: 10, buffer: 150, leftTapMove: 10, flipThreshold: 0.6, flipMs: 180, shotZone: 0.35, holdFull: 1250, spotRadius: 2.4 },
  // 접촉 경합, 슛
  contactR: 0.85, contestInterval: 0.45, dribbleSeconds: 0.8, dribbleBoost: 1.25,
  shot: { goalY: [8.5, 11.5], cornerOffset: 1.1, baseNoise: 0.12, rangeBase: 8, rangePerShooting: 0.45, minPower: 0.15, speedMin: 12, speedMax: 26, powerSave: 0.22, powerNoise: 0.35 },
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
// 손가락 입력 구분(지연 없이 즉시): 탭 = 이동 12px 이내 + 250ms 이내, 쓸기 = 28px 이상 + 0.5px/ms 이상
export function classifyGesture({ m, ms }) {
  const t = TUNE.input;
  if (m <= t.tapMove && ms <= t.tapMs) return 'tap';
  if (m >= t.flickPx && m / Math.max(1, ms) >= t.flickSpeed) return 'flick';
  return 'drag';
}
// 쓸기 방향의 세로 성분으로 위(-1) / 가운데(0) / 아래(+1) 구석
export const shotZone = (dx, dy) => { const d = Math.hypot(dx, dy) || 1; return dy < -TUNE.input.shotZone * d ? -1 : (dy > TUNE.input.shotZone * d ? 1 : 0); };

// 오른쪽 화면을 꾹 누른 시간(ms) → 슛 세기(0.15~1). 250ms부터 차오르고 1.25초에 가득 찬다.
export const shotPower = (holdMs) => clamp((holdMs - TUNE.input.tapMs) / (TUNE.input.holdFull - TUNE.input.tapMs), TUNE.shot.minPower, 1);
