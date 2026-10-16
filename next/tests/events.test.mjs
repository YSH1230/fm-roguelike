import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { createClub } from '../engine/economy.mjs';
import { applyChoice, canChoose, interviewFor, pickPress, pressSituation } from '../engine/events.mjs';

const mk = () => createTeam({ rng: createRng(1), id: 'A' });

test('기자회견 상황: 승패 차이 +4 이상 연승, -4 이하 부진, 그 사이 평범', () => {
  assert.equal(pressSituation({ won: 9, lost: 5 }), 'winning');
  assert.equal(pressSituation({ won: 8, lost: 5 }), 'even');
  assert.equal(pressSituation({ won: 4, lost: 8 }), 'losing');
  assert.equal(pressSituation({ won: 5, lost: 8 }), 'even');
});

test('기자회견 질문은 상황마다 선택지 2개이고 모르는 상황은 오류다', () => {
  for (const s of ['winning', 'losing', 'even']) {
    const q = pickPress(createRng(2), s);
    assert.equal(q.options.length, 2);
    assert.ok(q.text.length > 0);
  }
  assert.throws(() => pickPress(createRng(2), 'weird'), /알 수 없는 상황/);
});

test('선택 효과: 팀 사기·팬·코인이 적용되고 0~100을 벗어나지 않는다', () => {
  const team = mk();
  const club = createClub({ coins: 5, fans: 99 });
  applyChoice({ club, team, option: { effects: { teamMood: 40, fans: 5, coins: 10 } } });
  assert.equal(club.coins, 15);
  assert.equal(club.fans, 100);
  assert.ok(team.stars.every((p) => p.mood === 100));
  applyChoice({ club, team, option: { effects: { teamMood: -200, fans: -200 } } });
  assert.ok(team.stars.every((p) => p.mood === 0));
  assert.equal(club.fans, 0);
});

test('코인이 모자란 선택은 막고 아무것도 바꾸지 않는다', () => {
  const team = mk();
  const club = createClub({ coins: 5, fans: 50 });
  const player = team.stars[0];
  const option = { effects: { coins: -10, playerMood: 12, fans: 3 } };
  assert.equal(canChoose(club, option), false);
  assert.throws(() => applyChoice({ club, team, option, player }), /코인이 모자랍니다/);
  assert.equal(club.coins, 5);
  assert.equal(club.fans, 50);
  assert.equal(player.mood, 70);
});

test('면담 효과를 면담 선수 없이 적용하면 오류다', () => {
  const team = mk();
  assert.throws(() => applyChoice({ club: createClub(), team, option: { effects: { playerMood: 5 } } }), /면담 선수/);
});

test('면담 상황: 사기 낮음 > 컨디션 낮음 > 득점 슬럼프 순으로 걸리고, 평범하면 광고 아니면 없음', () => {
  const rng = createRng(3);
  const p = mk().stars.find((s) => s.position === 'FW');
  p.mood = 40;
  p.condition = 10;
  assert.equal(interviewFor(rng, p).id, 'iv-unhappy');
  p.mood = 70;
  assert.equal(interviewFor(rng, p).id, 'iv-tired');
  p.condition = 100;
  p.stats = { apps: 12, goals: 0, assists: 1 };
  assert.equal(interviewFor(rng, p).id, 'iv-slump');
  p.stats = { apps: 12, goals: 3, assists: 1 };
  const results = new Set(Array.from({ length: 200 }, () => interviewFor(rng, p)?.id ?? null));
  assert.deepEqual([...results].sort(), ['iv-ad', null]);
  p.mood = 59;
  assert.equal(interviewFor(rng, p), null);
});

test('면담 선택: 쉬게 하면 다음 구간 휴식이 지정되고 사기가 오르며, 광고는 코인을 주고 사기를 깎는다', () => {
  const team = mk();
  const club = createClub({ coins: 0 });
  const p = team.stars[0];
  p.condition = 10;
  const tired = interviewFor(createRng(4), p);
  applyChoice({ club, team, option: tired.options[0], player: p });
  assert.equal(p.resting, true);
  assert.equal(p.mood, 76);
  const q = team.stars[1];
  const ad = { effects: { coins: 15, playerMood: -5 } };
  applyChoice({ club, team, option: ad, player: q });
  assert.equal(club.coins, 15);
  assert.equal(q.mood, 65);
});
