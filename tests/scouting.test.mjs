import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePeak, SCOUT_ACCURACY, MIN_HALF_WIDTH } from '../engine/scouting.mjs';
import { valuePrice } from '../engine/economy.mjs';

const p = (i, peak = 75) => ({ id: `p${i}`, baseOVR: 60, peakOVR: peak, peakBodyAge: 27, age: 20, position: 'CMF' });

test('같은 선수·같은 등급이면 추정이 항상 같다', () => {
  assert.deepEqual(estimatePeak(p(1), 'veteran'), estimatePeak(p(1), 'veteran'));
});

test('등급이 높을수록 범위가 좁고, 최상급도 최소 폭 이상이다', () => {
  const w = (lv) => { const e = estimatePeak({ ...p(2), baseOVR: 40 }, lv); return e.hi - e.lo; };
  assert.ok(w('academy') > w('proLicense') && w('proLicense') > w('veteran') && w('veteran') > w('master'));
  assert.ok(w('master') >= MIN_HALF_WIDTH * 2 - 1);
});

test('범위가 진짜 전성기를 덮는 비율이 등급별 설정과 비슷하다(최상급도 틀릴 때가 있다)', () => {
  for (const [level, acc] of Object.entries(SCOUT_ACCURACY)) {
    let hit = 0; const n = 3000;
    for (let i = 0; i < n; i++) { const e = estimatePeak({ ...p(i, 75), baseOVR: 40 }, level); if (e.lo <= 75 && 75 <= e.hi) hit += 1; }
    assert.ok(Math.abs(hit / n - acc.hit) < 0.06, `${level} 적중 ${hit / n}`);
  }
});

test('같이 지낸 시즌이 쌓이면 범위가 좁아지고 최소 폭은 남는다', () => {
  const w = (s) => { const e = estimatePeak({ ...p(3), baseOVR: 40 }, 'academy', s); return e.hi - e.lo; };
  assert.ok(w(0) > w(3) && w(3) > w(8));
  assert.ok(w(20) >= MIN_HALF_WIDTH * 2 - 1);
});

test('전성기가 높은 어린 선수는 같은 OVR의 노장보다 비싸고, 시장 평가가 틀리면 가격이 달라진다', () => {
  const base = { baseOVR: 60, position: 'CMF', specialTrait: null };
  const young = valuePrice({ ...base, age: 19, peakOVR: 78, peakBodyAge: 26 });
  const old = valuePrice({ ...base, age: 30, peakOVR: 60, peakBodyAge: 26 });
  assert.ok(young > old);
  assert.ok(valuePrice({ ...base, age: 19, peakOVR: 78, peakBodyAge: 26 }, 0.1) > young);
});
