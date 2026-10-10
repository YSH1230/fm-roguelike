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

test('rivalPoach: 적응도가 4 깎인다', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0.5), { rivalPoach: 1000 });
  assert.equal(r.chemistry, ctx().chemistry - 4);
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

test('은퇴 앞둔 레전드는 시즌 후 은퇴 표시가 붙는다', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0.5), { retiringLegend: 1000 });
  const legend = r.squad.at(-1);
  assert.equal(legend.retiresAfterSeason, true);
});

test('이벤트 풀은 20종이고, 선택형 5종이 섞여 있다', async () => {
  const { EVENT_IDS } = await import('../data/season-events.mjs');
  assert.equal(EVENT_IDS.length, 20);
  assert.equal(new Set(EVENT_IDS).size, 20);
});

test('최근에 나온 이벤트는 가중치가 낮아져 거의 반복되지 않는다', async () => {
  const { EVENT_IDS } = await import('../data/season-events.mjs');
  const recent = EVENT_IDS.filter((id) => id !== 'pressPraise'); // 하나만 빼고 전부 최근 이벤트
  let praise = 0;
  for (let i = 0; i < 400; i++) {
    const r = rollSeasonEvent(ctx({ recent }), 'summer', (() => { let k = 0; return () => (k++ === 0 ? 0 : Math.random()); })());
    if (r.id === 'pressPraise') praise++;
  }
  assert.ok(praise > 60, `최근이 아닌 이벤트가 압도적으로 나와야 한다 (${praise}/400)`);
});

test('선택형 이벤트: 스폰서 일시금은 지금 자금, 장기 계약은 다음 시즌 가산', async () => {
  const { resolveChoice, describeChoice } = await import('../data/season-events.mjs');
  const c = { id: 'sponsorOffer', payload: {} };
  const base = ctx();
  assert.equal(describeChoice(c, base).options.length, 2);
  assert.equal(resolveChoice(c, 0, base).funds, 1000 + 120);
  const long = resolveChoice(c, 1, base);
  assert.equal(long.funds, 1000);
  assert.equal(long.state.nextGrantBonus, 0.22);
});

test('선택형 이벤트: 빅클럽 제안 - 보내면 이적료를 받고 떠나고, 붙잡으면 남는다', async () => {
  const { resolveChoice } = await import('../data/season-events.mjs');
  const c = { id: 'bigClubOffer', payload: { playerId: 'b' } };
  const base = ctx();
  const sold = resolveChoice(c, 0, base);
  assert.equal(sold.squad.some((p) => p.id === 'b'), false);
  assert.equal(sold.funds, 1000 + Math.round(10 * 0.85));
  const kept = resolveChoice(c, 1, base);
  assert.equal(kept.squad.some((p) => p.id === 'b'), true);
});

test('전술 분석관 합류: 불화 면제 플래그를 건다', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0.5), { analystJoins: 1000 });
  assert.equal(r.state.harmonyShield, true);
});

test('출전 요구: 약속하면 OVR +1·적응도 -2, 거절하면 OVR -1', async () => {
  const { resolveChoice } = await import('../data/season-events.mjs');
  const c = { id: 'playtimeDemand', payload: { playerId: 'a' } };
  const base = ctx();
  const yes = resolveChoice(c, 0, base);
  assert.equal(yes.squad.find((p) => p.id === 'a').baseOVR, 61);
  assert.equal(yes.chemistry, base.chemistry - 2);
  assert.equal(resolveChoice(c, 1, base).squad.find((p) => p.id === 'a').baseOVR, 59);
});

test('베테랑의 조언: 어린 선수 OVR +1', () => {
  const sq = [mk('a', 60), mk('b', 80)].map((p, i) => ({ ...p, age: i ? 33 : 20 }));
  const r = rollSeasonEvent(ctx({ squad: sq }), 'summer', seq(0, 0.5), { mentor: 1000 });
  assert.equal(r.squad.find((p) => p.id === 'a').baseOVR, 61);
});

test('감독·스태프가 열리기 전에는 감독 관련 이벤트가 나오지 않는다', () => {
  for (const id of ['tacticalSeminar', 'analystJoins']) {
    const r = rollSeasonEvent(ctx({ staffOn: false }), 'summer', seq(0, 0.5), { [id]: 100000 });
    assert.notEqual(r.id, id);
  }
  assert.equal(rollSeasonEvent(ctx(), 'summer', seq(0, 0.5), { analystJoins: 100000 }).id, 'analystJoins');
});
