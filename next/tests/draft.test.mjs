import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { marketValue } from '../engine/contract.mjs';
import {
  autoPickUntil, createDraft, draftOrder, draftPick, draftedBy, generateProspects, grantPicks, isDraftOver, spendPicks,
} from '../engine/draft.mjs';

const ids = Array.from({ length: 20 }, (_, i) => `T${i}`);
const standings = ids.map((id) => ({ id })); // T0이 1위, T19가 꼴찌
const teams = () => ids.map((id) => createTeam({ rng: createRng(1), id }));

test('후보 20명은 19~21세이고 id가 겹치지 않는다', () => {
  const list = generateProspects(createRng(1), { prefix: 'D1' });
  assert.equal(list.length, 20);
  assert.equal(new Set(list.map((p) => p.id)).size, 20);
  for (const p of list) assert.ok(p.age >= 19 && p.age <= 21);
});

test('꼴찌가 1번 지명이고 지명권이 없으면 원래 팀이 주인이다', () => {
  const t = teams();
  grantPicks(t, 2027);
  const order = draftOrder(standings, t, 2027);
  assert.equal(order.length, 20);
  assert.deepEqual(order[0], { slot: 1, from: 'T19', owner: 'T19' });
  assert.equal(order[19].from, 'T0');
});

test('지명권을 넘기면 슬롯 주인이 바뀐다', () => {
  const t = teams();
  grantPicks(t, 2027);
  const moved = t[19].picks.pop();
  t[0].picks.push(moved);
  assert.equal(draftOrder(standings, t, 2027)[0].owner, 'T0');
});

test('spendPicks는 그 해 지명권만 지운다', () => {
  const t = teams();
  grantPicks(t, 2027);
  grantPicks(t, 2028);
  spendPicks(t, 2027);
  assert.deepEqual(t[0].picks, [{ year: 2028, from: 'T0' }]);
});

function setup(seed) {
  const rng = createRng(seed);
  const t = teams();
  grantPicks(t, 2027);
  const draft = createDraft({ prospects: generateProspects(rng, { prefix: 'D' }), order: draftOrder(standings, t, 2027) });
  return { rng, draft };
}

test('내 순번까지 AI가 지명하고, 내가 고르면 다음으로 넘어간다', () => {
  const { rng, draft } = setup(2);
  autoPickUntil(draft, 'T15', rng); // 슬롯 5번(T15)
  assert.equal(draft.next, 4);
  assert.equal(draft.picks.length, 4);
  draftPick(draft, 'T15', draft.pool[0].id);
  assert.equal(draft.next, 5);
});

test('AI는 대체로 좋은 후보부터 가져간다', () => {
  const { rng, draft } = setup(3);
  const all = [...draft.pool].sort((a, b) => marketValue(b) - marketValue(a));
  autoPickUntil(draft, 'T10', rng); // 슬롯 10번(T10)
  const taken = new Set(draft.picks.map((p) => p.player.id));
  const topFive = all.slice(0, 5).filter((p) => taken.has(p.id)).length;
  assert.ok(topFive >= 3, `상위 5명 중 ${topFive}명`);
});

test('끝까지 가면 20명이 모두 팀에 갈라지고 신인 계약은 3년이다', () => {
  const { rng, draft } = setup(4);
  autoPickUntil(draft, 'nobody', rng);
  assert.ok(isDraftOver(draft));
  assert.equal(draft.pool.length, 0);
  const mine = draftedBy(draft, 'T19');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].contract.years, 3);
  assert.ok(mine[0].contract.salary >= 1);
});

test('내 팀이 순번표에 없으면 AI가 끝까지 지명하고 멈춘다', () => {
  const { rng, draft } = setup(5);
  autoPickUntil(draft, 'ghost', rng);
  assert.equal(draft.picks.length, 20);
});

test('순번이 아닌 팀의 지명, 이미 뽑힌 선수, 끝난 뒤 지명은 오류다', () => {
  const { rng, draft } = setup(6);
  assert.throws(() => draftPick(draft, 'T0', draft.pool[0].id), /순번/);
  const first = draft.pool[0];
  draftPick(draft, 'T19', first.id);
  assert.throws(() => draftPick(draft, 'T18', first.id), /이미 지명/);
  autoPickUntil(draft, 'nobody', rng);
  assert.throws(() => draftPick(draft, 'T0', 'x'), /끝났/);
});

test('한 팀이 지명권 2장을 쥐면 두 번 고른다', () => {
  const rng = createRng(7);
  const t = teams();
  grantPicks(t, 2027);
  t[18].picks.push(t[19].picks.pop()); // T18이 1번과 2번 슬롯을 모두 쥔다
  const draft = createDraft({ prospects: generateProspects(rng, { prefix: 'D' }), order: draftOrder(standings, t, 2027) });
  draftPick(draft, 'T18', draft.pool[0].id);
  draftPick(draft, 'T18', draft.pool[0].id);
  assert.equal(draftedBy(draft, 'T18').length, 2);
});
