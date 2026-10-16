import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, readSave, saveGame, SAVE_KEY, writeSave } from '../engine/save.mjs';
import { playNextChunk } from '../engine/game.mjs';
import { beginOffseason, closeMarket, openMarket } from '../engine/offseason.mjs';
import { leagueKey, myLeague } from '../engine/world.mjs';
import { autoSeason, startedGame } from './helpers.mjs';

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test('불러온 게임은 같은 팀 객체를 공유한다(리그의 내 팀 = myTeam, 스타는 라인업 안의 같은 선수)', () => {
  const g = startedGame(1);
  playNextChunk(g);
  const g2 = loadGame(saveGame(g));
  assert.equal(myLeague(g2.world).teams.get('ME'), g2.myTeam);
  for (const p of g2.myTeam.stars) assert.ok(g2.myTeam.lineup.includes(p));
  for (const league of g2.world.leagues.values()) {
    for (const t of league.teams.values()) if (t.named) for (const p of t.named) assert.ok(t.stars.includes(p));
  }
  assert.equal(g2.phase, 'manage');
  assert.equal(g2.chunk, 1);
});

test('저장 직후 이어서 한 게임과 불러온 게임은 같은 구간 결과를 낸다', () => {
  const g = startedGame(2);
  playNextChunk(g);
  const g2 = loadGame(saveGame(g));
  const a = playNextChunk(g);
  const b = playNextChunk(g2);
  assert.deepEqual(a.matches, b.matches);
  assert.deepEqual(a.income, b.income);
  assert.deepEqual(a.steps, b.steps);
  assert.equal(g.club.coins, g2.club.coins);
});

test('시즌 종료 뒤(승강 결과 Map 포함)에 저장·불러오기를 해도 오프시즌을 이어갈 수 있다', () => {
  for (let seed = 1; seed < 30; seed += 1) {
    const g = startedGame(seed);
    autoSeason(g);
    if (g.phase !== 'offseason') continue;
    const g2 = loadGame(saveGame(g));
    assert.equal(g2.season.outcome.finalRank.get('ME'), g.season.outcome.finalRank.get('ME'));
    beginOffseason(g);
    beginOffseason(g2);
    assert.deepEqual(g.off.resignQueue.map((p) => p.id), g2.off.resignQueue.map((p) => p.id));
    assert.equal(g2.world.year, 2);
    return;
  }
  assert.fail('경질되지 않는 시드를 찾지 못했습니다');
});

test('FA 시장 도중에 저장해도 같은 시장이 이어지고 마감 결과도 같다', () => {
  for (let seed = 1; seed < 30; seed += 1) {
    const g = startedGame(seed);
    autoSeason(g);
    if (g.phase !== 'offseason') continue;
    beginOffseason(g);
    g.off.resignQueue.forEach((p) => { p.contract.years = 3; });
    g.off.resignQueue = [];
    openMarket(g);
    const g2 = loadGame(saveGame(g));
    assert.deepEqual(g2.off.market.map((e) => e.player.id), g.off.market.map((e) => e.player.id));
    closeMarket(g);
    closeMarket(g2);
    assert.deepEqual(g.off.aiSigned, g2.off.aiSigned);
    assert.deepEqual(g.off.draft.order, g2.off.draft.order);
    return;
  }
  assert.fail('경질되지 않는 시드를 찾지 못했습니다');
});

test('저장 크기는 브라우저 저장소 한도(약 5MB) 안에 든다', () => {
  const g = startedGame(3);
  autoSeason(g);
  const size = saveGame(g).length;
  assert.ok(size < 4_000_000, `저장 크기 ${size}`);
});

test('저장소에 쓰고 읽는다. 비어 있으면 null이고 버전이 다르면 오류다', () => {
  const storage = fakeStorage();
  assert.equal(readSave(storage), null);
  const g = startedGame(4);
  writeSave(g, storage);
  assert.equal(readSave(storage).phase, 'manage');
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 999, data: {} }));
  assert.throws(() => readSave(storage), /버전이 맞지 않아/);
  assert.ok(leagueKey(0, 3));
});
