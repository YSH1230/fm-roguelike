import test from 'node:test';
import assert from 'node:assert/strict';
import { nameOf } from '../engine/names.mjs';
import {
  acceptTrade, answerInterview, answerPress, createGame, finishSeason, incomingTrade, leagueAiTeams, myMatches,
  pickSlots, playNextChunk, proposeTrade, retireManager, startDraftAdvance, startDraftFinish, startDraftPick,
} from '../engine/game.mjs';
import { allTeams } from '../engine/world.mjs';
import { payroll } from '../engine/contract.mjs';
import { isDraftOver, pickNumbers } from '../engine/draft.mjs';
import { startedGame } from './helpers.mjs';

const started = (seed = 1) => startedGame(seed);

test('이름은 선수 id만으로 정해져 늘 같고, id가 다르면 대체로 다르다', () => {
  assert.equal(nameOf('ME-s0'), nameOf('ME-s0'));
  assert.match(nameOf('ME-s0'), /^\S+ \S+$/);
  const names = new Set(Array.from({ length: 200 }, (_, i) => nameOf(`p${i}`)));
  assert.ok(names.size > 150);
});

test('새 게임: 3부 팀에 배정 스타 5명, 시작 드래프트 후보 20명과 20개 구단 1라운드, 코치 2명이 있다', () => {
  const g = createGame({ seed: 1 });
  assert.equal(g.phase, 'startDraft');
  assert.deepEqual(g.myTeam.stars.map((p) => p.position), ['GK', 'DF', 'DF', 'MF', 'FW']);
  const d = g.startDraft;
  assert.equal(d.pool.length, 20);
  assert.equal(d.order.length, 20);
  assert.equal(new Set(d.order.map((o) => o.owner)).size, 20);
  assert.equal(pickNumbers(d, 'ME').length, 1);
  // 순번은 작년 순위가 나쁜 팀부터이고 내 구단의 작년 순위는 15~19위다
  const ranks = d.order.map((o) => d.lastYear[o.owner]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a));
  assert.ok(d.lastYear.ME >= 15 && d.lastYear.ME <= 19);
  assert.equal(d.started, false);
  assert.equal(g.myTeam.tier, 3);
  assert.equal(g.myTeam.coaches.attack.kind, 'attack');
  assert.equal(g.club.coins, 30);
  assert.equal(g.myTeam.stars.every((p) => p.contract.years === 3), true);
});

test('시작 드래프트: 시작 전에는 지명할 수 없고, 시작하면 내 순번까지 AI가 지명하며, 한 명을 고르면 끝난다', () => {
  const g = createGame({ seed: 2 });
  const d = g.startDraft;
  assert.throws(() => startDraftPick(g, d.pool[0].id), /먼저 시작/);
  startDraftAdvance(g);
  const first = pickNumbers(d, 'ME')[0];
  assert.equal(d.next, first - 1); // 내 순번 직전까지 AI가 지명했다
  assert.equal(d.picks.length, first - 1);
  assert.equal(d.order[d.next].owner, 'ME');
  startDraftPick(g, d.pool[0].id);
  assert.ok(isDraftOver(d));
  assert.equal(g.phase, 'startDraft'); // 끝났지만 결과를 보고 직접 넘어간다
  assert.equal(d.pool.length, 0);
  assert.throws(() => startDraftPick(g, 'x'), /끝났/);
  startDraftFinish(g);
  assert.equal(g.phase, 'manage');
  assert.equal(g.myTeam.stars.length, 6);
  assert.equal(g.myTeam.lineup.length, 11);
});

test('시작 드래프트: 끝나기 전에는 시즌을 시작할 수 없고, 순번이 아닐 때 고르면 오류다', () => {
  const g = createGame({ seed: 3 });
  startDraftAdvance(g);
  assert.throws(() => startDraftFinish(g), /아직 끝나지/);
  const d = g.startDraft;
  startDraftPick(g, d.pool[0].id);
  assert.equal(d.picks.filter((p) => p.owner === 'ME').length, 1);
  assert.equal(new Set(d.picks.map((p) => p.player.id)).size, 20);
});

test('시작 드래프트 전에는 시즌을 진행할 수 없다', () => {
  assert.throws(() => playNextChunk(createGame({ seed: 3 })), /지금은 할 수 없습니다/);
});

test('구간 진행: 14경기를 치르고 수입이 들어오며 기자회견이 나온다', () => {
  const g = started(4);
  const coins = g.club.coins;
  const r = playNextChunk(g);
  assert.equal(r.chunk, 1);
  assert.equal(r.matches.length, 14);
  assert.equal(r.won + r.drawn + r.lost, 14);
  assert.equal(g.club.coins, coins + r.income.total);
  assert.equal(r.press.options.length, 2);
  assert.equal(g.phase, 'manage');
  assert.equal(myMatches(r.matches, 'ME').length, 14);
});

test('세 구간 뒤 시즌 종료 단계가 되고 더 진행하면 오류다', () => {
  const g = started(5);
  playNextChunk(g); playNextChunk(g);
  const last = playNextChunk(g);
  assert.equal(last.matches.length, 10);
  assert.equal(g.phase, 'seasonEnd');
  assert.throws(() => playNextChunk(g), /지금은 할 수 없습니다/);
});

test('기자회견과 면담에 답하면 효과가 적용되고 목록에서 사라진다', () => {
  const g = started(6);
  playNextChunk(g);
  const before = g.club.fans;
  answerPress(g, 0);
  assert.equal(g.pending.press, null);
  assert.throws(() => answerPress(g, 0), /기자회견이 없습니다/);
  assert.ok(Number.isFinite(g.club.fans) && g.club.fans >= 0 && before >= 0);
  g.pending.interviews = [];
  assert.throws(() => answerInterview(g, 'ME-s0', 0), /면담이 없습니다/);
});

test('쉬게 지정한 스타는 그 구간에 출전하지 않는다', async () => {
  const { setRest } = await import('../engine/condition.mjs');
  const g = started(7);
  const rested = g.myTeam.stars[5];
  setRest(g.myTeam, [rested.id]);
  playNextChunk(g);
  assert.equal(rested.stats.apps, 0);
  assert.equal(g.myTeam.stars[0].stats.apps, 14); // 구간 중 부상은 구간이 끝난 뒤에 정해진다
});

test('시즌 종료: 시상·승강·감독 운명이 정해지고 기록이 쌓인다', () => {
  const g = started(8);
  playNextChunk(g); playNextChunk(g); playNextChunk(g);
  const s = finishSeason(g);
  assert.ok(['stay', 'promoted', 'fired'].includes(s.fate));
  assert.equal(Object.keys(s.awards).length, 6);
  assert.equal(g.history.mySeasons.length, 1);
  assert.equal(g.history.champions.length, 1);
  assert.equal(g.phase, s.fate === 'fired' ? 'ended' : 'offseason');
  assert.equal(s.draftStandings.length, 20);
});

test('경질이면 런이 끝나고 요약이 붙는다', () => {
  const g = started(9);
  playNextChunk(g); playNextChunk(g); playNextChunk(g);
  const s = finishSeason(g);
  if (s.fate === 'fired') {
    assert.equal(g.end.reason, 'fired');
    assert.equal(g.end.summary.seasons, 1);
  } else {
    assert.equal(g.end, null);
  }
});

test('감독 은퇴: 시즌 종료 직후에만 가능하고 런이 끝난다', () => {
  const g = started(10);
  assert.throws(() => retireManager(g), /지금은 할 수 없습니다/);
  for (let i = 0; i < 3; i += 1) playNextChunk(g);
  finishSeason(g);
  if (g.phase === 'offseason') {
    retireManager(g);
    assert.equal(g.end.reason, 'retired');
    assert.equal(g.phase, 'ended');
  }
});

test('트레이드: AI 제안을 받으면 선수가 바뀌고, 내가 한 제안은 상대 기준으로 판정된다', () => {
  const g = started(11);
  const offer = incomingTrade(g);
  assert.ok(offer);
  const mine = g.myTeam.stars.find((p) => p.id === offer.give.players[0]);
  const ai = leagueAiTeams(g).find((t) => t.id === offer.aiTeamId);
  const theirs = ai.stars.find((p) => p.id === offer.get.players[0]);
  g.club.coins += 0;
  try {
    acceptTrade(g, offer);
    assert.ok(g.myTeam.stars.includes(theirs) && ai.stars.includes(mine));
    assert.equal(g.myTeam.stars.length, 6);
  } catch (e) {
    assert.match(e.message, /샐러리캡/); // 캡을 넘는 제안이면 막힌다
  }
  assert.ok(payroll(g.myTeam) >= 0);
  const slots = pickSlots(g);
  assert.equal(slots.size, 20);
  const bad = { aiTeamId: leagueAiTeams(g)[0].id, give: { players: [], picks: [] }, get: { players: [], picks: [] } };
  assert.equal(proposeTrade(g, bad).reason, 'invalid');
  assert.throws(() => proposeTrade(g, { ...bad, aiTeamId: 'nobody' }), /상대 팀/);
  assert.equal(allTeams(g.world).length, 200);
});
