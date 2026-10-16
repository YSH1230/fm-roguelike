import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { grantPicks } from '../engine/draft.mjs';
import { newContract, payroll } from '../engine/contract.mjs';
import { aiAccepts, checkOffer, executeTrade, pickValue, proposeAi } from '../engine/trade.mjs';

function world(seed = 1) {
  const rng = createRng(seed);
  const me = createTeam({ rng, id: 'ME', starLevel: 60 });
  const ai = createTeam({ rng, id: 'AI', starLevel: 60 });
  for (const t of [me, ai]) t.stars.forEach((p) => { p.contract = newContract(10); });
  grantPicks([me, ai], 2027);
  const slots = new Map([['ME', 10], ['AI', 10]]);
  return { rng, me, ai, slots };
}
const swap = (me, ai, extra = {}) => ({ give: { players: [me.stars[3].id], picks: [] }, get: { players: [ai.stars[3].id], picks: [] }, ...extra });

test('지명권 가치는 앞 순번일수록 크다', () => {
  assert.ok(pickValue(1) > pickValue(10));
  assert.ok(pickValue(10) > pickValue(20));
  assert.ok(pickValue(1, 1) > pickValue(1, 2)); // 2라운드 지명권은 같은 순번의 1라운드보다 값어치가 낮다
  assert.ok(pickValue(20, 1) > pickValue(1, 2) - 25);
});

test('구조 검사: 선수 수 불일치, 없는 선수, 없는 지명권, 빈 거래는 이유를 돌려준다', () => {
  const { me, ai } = world();
  assert.equal(checkOffer(swap(me, ai), me, ai), null);
  assert.equal(checkOffer({ give: { players: [me.stars[0].id], picks: [] }, get: { players: [], picks: [{ year: 2027, round: 1, from: 'AI' }] } }, me, ai), null); // 선수와 지명권도 맞바꾼다
  assert.match(checkOffer({ give: { players: [], picks: [{ year: 2027, round: 1, from: 'ME' }] }, get: { players: [ai.stars[0].id], picks: [] } }, me, ai), /6명/); // 내 스타가 7명이 되는 거래는 안 된다
  assert.match(checkOffer({ give: { players: ['nope'], picks: [] }, get: { players: [ai.stars[0].id], picks: [] } }, me, ai), /없습니다/);
  assert.match(checkOffer({ give: { players: [], picks: [{ year: 2027, round: 1, from: 'AI' }] }, get: { players: [], picks: [] } }, me, ai), /지명권/);
  assert.match(checkOffer({ give: { players: [], picks: [] }, get: { players: [], picks: [] } }, me, ai), /한 가지 이상/);
});

test('AI는 내가 더 좋은 선수를 주면 수락하고, 같은 가치의 맞교환은 거절한다(10% 여유 필요)', () => {
  const { me, ai, slots } = world();
  me.stars[3].attrs = Object.fromEntries(Object.keys(me.stars[3].attrs).map((k) => [k, 90]));
  me.stars[3].potential = 95;
  const args = { me, ai, myCap: 999, aiCap: 999, slots };
  assert.equal(aiAccepts({ offer: swap(me, ai), ...args }).accepted, true);
  const { me: m2, ai: a2 } = world();
  m2.stars[3].attrs = { ...a2.stars[3].attrs };
  m2.stars[3].potential = a2.stars[3].potential;
  assert.equal(aiAccepts({ offer: swap(m2, a2), me: m2, ai: a2, myCap: 999, aiCap: 999, slots }).reason, 'value');
});

test('AI는 사기 30 미만 선수를 받지 않는다', () => {
  const { me, ai, slots } = world();
  me.stars[3].attrs = Object.fromEntries(Object.keys(me.stars[3].attrs).map((k) => [k, 90]));
  me.stars[3].mood = 29;
  assert.equal(aiAccepts({ offer: swap(me, ai), me, ai, myCap: 999, aiCap: 999, slots }).reason, 'mood');
});

test('거래 뒤 양쪽 중 한 팀이라도 캡을 넘으면 거절/오류다', () => {
  const { rng, me, ai, slots } = world();
  me.stars[3].attrs = Object.fromEntries(Object.keys(me.stars[3].attrs).map((k) => [k, 90]));
  ai.stars[3].contract.salary = 30; // 내가 30짜리를 받으면 내 연봉 총액 60 → 80
  assert.equal(aiAccepts({ offer: swap(me, ai), me, ai, myCap: 70, aiCap: 999, slots }).reason, 'cap');
  assert.throws(() => executeTrade({ offer: swap(me, ai), me, ai, myCap: 70, aiCap: 999, rng }), /샐러리캡/);
  assert.equal(me.stars.length, 6);
});

test('executeTrade: 선수와 지명권이 서로 옮겨 가고 양쪽 스타는 6명, 라인업은 11명이다', () => {
  const { rng, me, ai } = world(2);
  const mine = me.stars[3];
  const theirs = ai.stars[3];
  const offer = { give: { players: [mine.id], picks: [{ year: 2027, round: 1, from: 'ME' }] }, get: { players: [theirs.id], picks: [] } };
  const before = payroll(me) + payroll(ai);
  executeTrade({ offer, me, ai, myCap: 999, aiCap: 999, rng });
  assert.ok(me.stars.includes(theirs) && !me.stars.includes(mine));
  assert.ok(ai.stars.includes(mine));
  assert.equal(me.stars.length, 6);
  assert.equal(ai.stars.length, 6);
  assert.equal(me.lineup.length, 11);
  assert.equal(ai.lineup.length, 11);
  assert.equal(me.picks.length, 1); // 1라운드를 넘겨서 2라운드만 남는다
  assert.equal(ai.picks.length, 3);
  assert.equal(payroll(me) + payroll(ai), before); // 연봉 총액 보존
});

test('executeTrade: 구조가 틀리면 아무것도 바꾸지 않고 오류다', () => {
  const { rng, me, ai } = world();
  const snapshot = me.stars.map((p) => p.id);
  assert.throws(() => executeTrade({ offer: { give: { players: ['x'], picks: [] }, get: { players: [ai.stars[0].id], picks: [] } }, me, ai, myCap: 999, aiCap: 999, rng }), /없습니다/);
  assert.deepEqual(me.stars.map((p) => p.id), snapshot);
});

test('AI 제안: 내 스타와 가치가 가장 비슷한 선수를 맞바꾸자고 하고 그대로 실행할 수 있다', () => {
  const { rng, me, ai } = world(3);
  const offer = proposeAi(rng, me, [ai], 2027);
  assert.equal(offer.aiTeamId, 'AI');
  assert.equal(checkOffer(offer, me, ai), null);
  executeTrade({ offer, me, ai, myCap: 999, aiCap: 999, rng });
  assert.equal(me.stars.length, 6);
});

test('AI 제안: 상대 선수가 더 약하면 지명권을 덧붙이고, 보낼 팀이 없으면 null이다', () => {
  const { rng, me, ai } = world(4);
  for (const p of ai.stars) p.attrs = Object.fromEntries(Object.keys(p.attrs).map((k) => [k, 20]));
  const offer = proposeAi(rng, me, [ai], 2027);
  assert.deepEqual(offer.get.picks, [{ year: 2027, round: 1, from: 'AI' }]);
  assert.equal(proposeAi(rng, me, [], 2027), null);
  const empty = { ...me, stars: [] };
  assert.equal(proposeAi(rng, empty, [ai], 2027), null);
});

test('지명권끼리 맞바꿀 수 있고, 2라운드 지명권도 따로 옮겨 간다', () => {
  const { rng, me, ai } = world(5);
  const offer = { give: { players: [], picks: [{ year: 2027, round: 2, from: 'ME' }] }, get: { players: [], picks: [{ year: 2027, round: 2, from: 'AI' }] } };
  assert.equal(checkOffer(offer, me, ai), null);
  executeTrade({ offer, me, ai, myCap: 999, aiCap: 999, rng });
  assert.ok(me.picks.some((k) => k.from === 'AI' && k.round === 2));
  assert.ok(me.picks.some((k) => k.from === 'ME' && k.round === 1)); // 1라운드는 그대로
  assert.equal(me.picks.length, 2);
  assert.equal(ai.picks.length, 2);
});

test('선수를 내주고 지명권을 받으면 AI 팀은 가장 약한 선수를 내보내 6명을 유지한다', () => {
  const { rng, me, ai } = world(7);
  const offer = { give: { players: [me.stars[3].id], picks: [] }, get: { players: [], picks: [{ year: 2027, round: 1, from: 'AI' }] } };
  assert.equal(checkOffer(offer, me, ai), null);
  executeTrade({ offer, me, ai, myCap: 999, aiCap: 999, rng });
  assert.equal(ai.stars.length, 6);
  assert.equal(me.stars.length, 5);
  assert.equal(me.picks.length, 3);
});

test('선수만 내주고 지명권을 받으면 AI 팀은 신인으로 스타 6명을 다시 채운다', () => {
  const { rng, me, ai } = world(6);
  const offer = { give: { players: [], picks: [{ year: 2027, round: 1, from: 'ME' }] }, get: { players: [ai.stars[0].id], picks: [] } };
  assert.match(checkOffer(offer, me, ai), /6명/); // 내가 선수를 받으면 7명이라 불가
  me.stars.pop(); // 내 스타를 5명으로 만든다
  const ok = { give: { players: [], picks: [{ year: 2027, round: 1, from: 'ME' }] }, get: { players: [ai.stars[0].id], picks: [] } };
  assert.equal(checkOffer(ok, me, ai), null);
  executeTrade({ offer: ok, me, ai, myCap: 999, aiCap: 999, rng });
  assert.equal(ai.stars.length, 6); // 줄어든 자리는 새 선수로 채운다
  assert.equal(me.stars.length, 6);
});
