import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollSeasonEvent } from '../data/season-events.mjs';
import { EVENT_CHANCE_SUMMER, EVENT_CHANCE_WINTER } from '../engine/constants.mjs';

const mk = (id, baseOVR, extra = {}) => ({
  id, name: `P${id}`, baseOVR, age: 25, position: 'CB', playstyleTags: [],
  continentTag: null, specialTrait: null, isDraftedYouth: false, price: 10, contractYearsLeft: 2, ...extra,
});
const ctx = (over = {}) => ({ squad: [mk('a', 60), mk('b', 80)], funds: 1000, chemistry: 60, baseFunds: 1000, crisisImmune: false, ...over });
// rng 시퀀스: 첫 값은 발생 여부, 둘째는 이벤트 선택(가중치 룰렛), 나머지는 효과 내부용
const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
test('확률 상수: 여름 90%, 겨울 70%', () => {
  assert.equal(EVENT_CHANCE_SUMMER, 0.9);
  assert.equal(EVENT_CHANCE_WINTER, 0.7);
});

test('발생 굴림이 확률 이상이면 이벤트 없음', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0.9));
  assert.equal(r.id, null);
  assert.equal(r.funds, 1000);
});

test('겨울은 0.8 굴림이면 이벤트 없음(70%), 여름은 발생', () => {
  assert.equal(rollSeasonEvent(ctx(), 'winter', seq(0.8)).id, null);
  assert.notEqual(rollSeasonEvent(ctx(), 'summer', seq(0.8, 0)).id, null);
});

test('mainSponsorship: 자금 +20%', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0));
  assert.equal(r.id, 'mainSponsorship');
  assert.equal(r.funds, 1200);
  assert.equal(r.tone, 'good');
});

test('bias로 특정 이벤트를 사실상 강제할 수 있다', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0.5), { pressCriticism: 1000 });
  assert.equal(r.id, 'pressCriticism');
  assert.equal(r.chemistry, 52);
});

test('bad 이벤트는 crisisImmune이면 효과 없이 무효화된다', () => {
  const r = rollSeasonEvent(ctx({ crisisImmune: true }), 'summer', seq(0, 0.5), { pressCriticism: 1000 });
  assert.equal(r.id, 'pressCriticism');
  assert.equal(r.chemistry, 60);
  assert.match(r.message, /무효/);
});

test('rivalPoach: 에이스 계약이 1년으로 줄어든다', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0.5), { rivalPoach: 1000 });
  assert.equal(r.squad.find((p) => p.id === 'b').contractYearsLeft, 1);
});

test('injuryAftermath: 한 명의 OVR이 3 깎인다', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0.5, 0), { injuryAftermath: 1000 });
  const total = (s) => s.reduce((n, p) => n + p.baseOVR, 0);
  assert.equal(total(r.squad), total(ctx().squad) - 3);
});

test('retiringLegend: 무료 베테랑 리더가 추가된다', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0.5), { retiringLegend: 1000 });
  assert.equal(r.squad.length, 3);
  const legend = r.squad.at(-1);
  assert.equal(legend.price, 0);
  assert.equal(legend.specialTrait, 'veteranLeader');
  assert.equal(legend.age, 35);
});

test('ffpAudit: 자금 부족이면 최약체 방출', () => {
  const r = rollSeasonEvent(ctx({ funds: 0 }), 'summer', seq(0, 0.5), { ffpAudit: 1000 });
  assert.equal(r.squad.length, 1);
  assert.equal(r.squad[0].id, 'b');
});

test('은퇴 앞둔 레전드는 재계약 불가 표시가 붙는다(무료 영입이라 재계약비가 0원이 되는 버그 방지)', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0.5), { retiringLegend: 1000 });
  const legend = r.squad.at(-1);
  assert.equal(legend.noRenewal, true);
});
