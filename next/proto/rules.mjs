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
  gaugeCycle: 1.3, // 왕복 게이지가 한 번 오가는 시간(초)
  fatigueD: 0.35, // 체력 감쇠 상수
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
export function powerWindow(shooting, { curl = false } = {}) {
  const w = (0.12 + (clamp(shooting, 0, 20) / 20) * 0.2) * (curl ? TUNE.wingShotPenalty : 1);
  return [0.65 - w / 2, 0.65 + w / 2];
}

// 방향 게이지(0~1) → 골대 위치(-1 왼쪽 포스트 ~ +1 오른쪽 포스트). 감아차기는 먼 포스트 쪽 구석에 치우친다.
export const aimOf = (g) => g * 2.4 - 1.2;

// 슛 결과: 'goal' | 'save' | 'post' | 'miss'. farSide: 감아차기일 때 알맞은 구석(-1 또는 1).
export function resolveShot({ power, aim, shooting, curl = false, farSide = 1 }) {
  const [lo, hi] = powerWindow(shooting, { curl });
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
export const shoulderInterval = (oppAttack) => 1.15 - clamp(oppAttack, 0, 20) * 0.025;
// 어깨싸움 허용 오차(초): 내 속도가 높을수록 넓다.
export const shoulderTolerance = (speed) => 0.11 + clamp(speed, 0, 20) * 0.007;
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
