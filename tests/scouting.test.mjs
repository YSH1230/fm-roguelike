import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePeak, SCOUT_ACCURACY, MIN_HALF_WIDTH, potentialGrade } from '../engine/scouting.mjs';
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

test('잠재력 등급: 올라갈 여지가 없으면 등급이 없고, 같은 선수는 항상 같은 등급이다', () => {
  assert.equal(potentialGrade({ ...p(1, 60), baseOVR: 60 }, 'master'), null);
  assert.equal(potentialGrade(p(7, 80), 'veteran'), potentialGrade(p(7, 80), 'veteran'));
});

test('잠재력 등급: 좋은 스카우터일수록 진짜 등급을 더 자주 맞힌다', () => {
  const hit = (level) => { let ok = 0; const n = 2000; for (let i = 0; i < n; i++) if (potentialGrade({ ...p(i, 70), baseOVR: 60 }, level) === 'A') ok += 1; return ok / n; }; // 진짜는 +10 = A
  assert.ok(hit('master') > hit('academy'));
  assert.ok(hit('academy') > 0.4); // 진짜 +10(A)을 아카데미도 절반쯤은 A로 본다
});

test('잠재력 등급: 오를 여지가 조금 있으면 "성장 없음"으로 보이지 않는다', () => {
  for (let i = 0; i < 500; i++) assert.ok(['S', 'A', 'B', 'C'].includes(potentialGrade({ ...p(i, 62), baseOVR: 60 }, 'academy')));
});

test('잠재력 등급: 전성기까지 +12 이상은 S, 그 아래는 A·B·C로 갈린다(최상급 스카우터 기준)', () => {
  const g = (up) => potentialGrade({ ...p(1, 60 + up), baseOVR: 60 }, 'master');
  const count = (up) => { const m = {}; for (let i = 0; i < 400; i++) { const x = potentialGrade({ id: `q${i}`, baseOVR: 60, peakOVR: 60 + up }, 'master'); m[x] = (m[x] ?? 0) + 1; } return m; };
  assert.ok(count(16).S > 300);
  assert.ok(count(9).A > 200);
  assert.ok(count(5).B > 200);
  assert.ok(count(2).C > 250);
  assert.ok(g(0) === null);
});
