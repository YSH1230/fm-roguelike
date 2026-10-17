import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TUNE, aimOf, blockResult, chooseTime, diveWindow, fatigue, finishBlockWindow, frontDefenderCount, gaugeAt, powerWindow,
  resolveShot, runCostMul, shootTime, shoulderInterval, shoulderTolerance, slingRange, widenGap,
} from '../proto/rules.mjs';

test('첫 선택 제한 시간은 시야가 높을수록 길다', () => {
  assert.ok(chooseTime(20) > chooseTime(0));
  assert.equal(chooseTime(0), TUNE.chooseTimeBase);
});

test('앞 수비수는 우리 진영 깊이에서 2명, 상대 진영 깊이에서 4명이고, 달리기 소모는 반대로 1.5 → 0.7배다', () => {
  assert.equal(frontDefenderCount(0, 10), 2);
  assert.equal(frontDefenderCount(1, 10), 4);
  assert.ok(frontDefenderCount(0.5, 20) >= frontDefenderCount(0.5, 0));
  assert.equal(runCostMul(0), 1.5);
  assert.ok(Math.abs(runCostMul(1) - 0.7) < 1e-9);
});

test('체력 효과: 장면이 진행될수록 약해지고, 체력이 높을수록 덜 약해진다. 20이면 변하지 않는다', () => {
  const low = fatigue(10, { scene: 20, stamina: 0 });
  const high = fatigue(10, { scene: 20, stamina: 15 });
  assert.ok(low < high && high < 10);
  assert.equal(fatigue(10, { scene: 20, stamina: 20 }), 10);
  assert.ok(fatigue(10, { scene: 5, stamina: 5, ranScenes: 4, c: 2 }) < fatigue(10, { scene: 5, stamina: 5 }));
});

test('슛 제한 시간은 4초이고 스트라이커만 결정력으로 최대 1초가 늘어난다', () => {
  assert.equal(shootTime(20, false), 4);
  assert.equal(shootTime(20, true), 5);
  assert.equal(shootTime(0, true), 4);
});

test('왕복 게이지는 0과 1 사이를 오간다', () => {
  assert.equal(gaugeAt(0), 0);
  assert.ok(Math.abs(gaugeAt(TUNE.gaugeCycle) - 1) < 1e-9);
  assert.ok(Math.abs(gaugeAt(TUNE.gaugeCycle * 2)) < 1e-9);
  for (let t = 0; t < 5; t += 0.1) assert.ok(gaugeAt(t) >= 0 && gaugeAt(t) <= 1);
});

test('슛 세기 창은 슈팅이 높을수록 넓고, 윙의 감아차기는 0.8배로 좁다', () => {
  const [a, b] = powerWindow(0);
  const [c, d] = powerWindow(20);
  assert.ok(d - c > b - a);
  const [e, f] = powerWindow(20, { curl: true });
  assert.ok(Math.abs((f - e) - (d - c) * 0.8) < 1e-9);
});

test('슛 결과: 약하면 선방, 세면 빗나감, 구석은 골, 중앙은 선방, 골대 근처는 맞춤, 밖은 빗나감', () => {
  const [lo, hi] = powerWindow(10);
  const mid = (lo + hi) / 2;
  const base = { power: mid, shooting: 10 };
  assert.equal(resolveShot({ ...base, power: lo - 0.01, aim: 0.7 }), 'save');
  assert.equal(resolveShot({ ...base, power: hi + 0.01, aim: 0.7 }), 'miss');
  assert.equal(resolveShot({ ...base, aim: 0.7 }), 'goal');
  assert.equal(resolveShot({ ...base, aim: -0.7 }), 'goal');
  assert.equal(resolveShot({ ...base, aim: 0.1 }), 'save');
  assert.equal(resolveShot({ ...base, aim: 1.0 }), 'post');
  assert.equal(resolveShot({ ...base, aim: 1.2 }), 'miss');
  assert.equal(aimOf(0.5), 0);
});

test('윙 감아차기는 먼 포스트 쪽 구석만 골이고 중앙은 위험하다', () => {
  const [lo, hi] = powerWindow(10, { curl: true });
  const base = { power: (lo + hi) / 2, shooting: 10, curl: true, farSide: -1 };
  assert.equal(resolveShot({ ...base, aim: -0.7 }), 'goal');
  assert.equal(resolveShot({ ...base, aim: 0.7 }), 'save');
  assert.equal(resolveShot({ ...base, aim: 0 }), 'save');
});

test('새총 패스 거리는 패스가 높을수록 길고 체력 감소를 받는다', () => {
  assert.ok(slingRange(20, 10, 0) > slingRange(0, 10, 0));
  assert.ok(slingRange(10, 0, 20) < slingRange(10, 0, 0));
});

test('어깨싸움: 상대 공격력이 높으면 박자가 빠르고, 내 속도가 높으면 허용 오차가 넓고, 놓치면 간격이 3까지 벌어진다', () => {
  assert.ok(shoulderInterval(20) < shoulderInterval(0));
  assert.ok(shoulderTolerance(20) > shoulderTolerance(0));
  assert.equal(widenGap(0), 1);
  assert.equal(widenGap(3), 3);
});

test('마무리 막기: 간격이 좁을수록 창이 넓고 태클이 중앙을 넓힌다. 간격이 최대여도 가장자리 창은 남고 중앙은 없다', () => {
  const near = finishBlockWindow(0, 10);
  const far = finishBlockWindow(2, 10);
  assert.ok(near.total > far.total);
  assert.ok(finishBlockWindow(0, 20).center > finishBlockWindow(0, 0).center);
  const worst = finishBlockWindow(3, 20);
  assert.ok(worst.total > 0 && worst.center === 0);
  assert.equal(blockResult(0.5, near), 'perfect');
  assert.equal(blockResult(0.5 + near.total / 2 - 0.001, near), 'partial');
  assert.equal(blockResult(0.95, near), 'miss');
  assert.equal(blockResult(0.5, worst), 'partial');
});

test('골키퍼 다이빙 창은 반응이 높을수록 넓고 체력 감소를 받는다', () => {
  assert.ok(diveWindow(20) > diveWindow(0));
  assert.ok(diveWindow(10, 20, 0) < diveWindow(10, 0, 0));
});
