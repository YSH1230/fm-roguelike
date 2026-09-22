import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSelfTraitBonus,
  computeTeamTraitBonuses,
  computePlaystyleSynergyBonus,
  computeContinentSynergyBonus,
  computePlayerFinalOVR,
} from '../engine/ovr.mjs';

function makePlayer(overrides = {}) {
  return {
    id: 'p1',
    baseOVR: 70,
    age: 25,
    position: 'ST',
    playstyleTags: [],
    continentTag: null,
    specialTrait: null,
    isDraftedYouth: false,
    seasonsAtClub: 0,
    acquiredThisSeason: false,
    inBench: false,
    ...overrides,
  };
}

test('성골 유스는 드래프트 유스 출신이면 본인 +3', () => {
  const p = makePlayer({ specialTrait: 'seongGolYouth', isDraftedYouth: true });
  assert.equal(computeSelfTraitBonus(p), 3);
});

test('성골 유스는 임시 유스(드래프트 아님)면 가산 없음', () => {
  const p = makePlayer({ specialTrait: 'seongGolYouth', isDraftedYouth: false });
  assert.equal(computeSelfTraitBonus(p), 0);
});

test('홈타운 영웅은 잔류 시즌당 +2, 상한 +6', () => {
  assert.equal(
    computeSelfTraitBonus(makePlayer({ specialTrait: 'hometownHero', seasonsAtClub: 1 })),
    2
  );
  assert.equal(
    computeSelfTraitBonus(makePlayer({ specialTrait: 'hometownHero', seasonsAtClub: 5 })),
    6
  );
});

test('저니맨은 이번 시즌 영입이면 본인 +4', () => {
  assert.equal(
    computeSelfTraitBonus(makePlayer({ specialTrait: 'journeyman', acquiredThisSeason: true })),
    4
  );
  assert.equal(
    computeSelfTraitBonus(makePlayer({ specialTrait: 'journeyman', acquiredThisSeason: false })),
    0
  );
});

test('베테랑 리더는 23세 이하 라인업 전원에게 +2, 중첩 없음', () => {
  const leader = makePlayer({ id: 'leader', age: 34, specialTrait: 'veteranLeader' });
  const young1 = makePlayer({ id: 'young1', age: 20 });
  const young2 = makePlayer({ id: 'young2', age: 23 });
  const old = makePlayer({ id: 'old', age: 28 });
  const lineup = [leader, young1, young2, old];
  const bonuses = computeTeamTraitBonuses(lineup, []);
  assert.equal(bonuses.get('young1'), 2);
  assert.equal(bonuses.get('young2'), 2);
  assert.equal(bonuses.get('old') ?? 0, 0);
  assert.equal(bonuses.get('leader') ?? 0, 0);
});

test('슈퍼 서브는 벤치에 있으면 선발 전원 +1, 여러 명이어도 최대 +2', () => {
  const starter = makePlayer({ id: 'starter' });
  const sub1 = makePlayer({ id: 'sub1', specialTrait: 'superSub', inBench: true });
  const sub2 = makePlayer({ id: 'sub2', specialTrait: 'superSub', inBench: true });
  const bonuses = computeTeamTraitBonuses([starter], [sub1, sub2]);
  assert.equal(bonuses.get('starter'), 2);
});

test('플레이스타일 시너지: 3명이면 tier3 값, 대상 포지션 보유자에게만', () => {
  const lineup = [
    makePlayer({ id: 'a', position: 'ST', playstyleTags: ['gegenpressing'] }),
    makePlayer({ id: 'b', position: 'CMF', playstyleTags: ['gegenpressing'] }),
    makePlayer({ id: 'c', position: 'CMF', playstyleTags: ['gegenpressing'] }),
    makePlayer({ id: 'd', position: 'GK', playstyleTags: [] }),
  ];
  const bonuses = computePlaystyleSynergyBonus(lineup);
  assert.equal(bonuses.get('a'), 4);
  assert.equal(bonuses.get('b'), 4);
  assert.equal(bonuses.get('c'), 4);
  assert.equal(bonuses.get('d') ?? 0, 0);
});

test('플레이스타일 시너지: 4명은 3명 값, 6명은 5명 값(계단식, 상한 5)', () => {
  const makeTagged = (id) => makePlayer({ id, position: 'ST', playstyleTags: ['gegenpressing'] });
  const lineup4 = ['a', 'b', 'c', 'd'].map(makeTagged);
  assert.equal(computePlaystyleSynergyBonus(lineup4).get('a'), 4); // tier3 값 유지

  const lineup6 = ['a', 'b', 'c', 'd', 'e', 'f'].map(makeTagged);
  assert.equal(computePlaystyleSynergyBonus(lineup6).get('a'), 7); // tier5 값 상한
});

test('대륙 시너지: 3명이면 tier3, 다국어 구사자(같은 권역)면 2명으로 감면', () => {
  const p = (id, extra = {}) => makePlayer({ id, continentTag: 'europe', ...extra });
  const lineupNoBonus = [p('a'), p('b')]; // 2명뿐, 다국어 구사자 없음 → 미달
  assert.equal(computeContinentSynergyBonus(lineupNoBonus).get('a') ?? 0, 0);

  const lineupWithPolyglot = [
    p('a', { specialTrait: 'polyglot' }),
    p('b'),
  ]; // 2명 + 다국어 구사자 → 요구 2명 충족 → tier3 발동
  const bonuses = computeContinentSynergyBonus(lineupWithPolyglot);
  assert.equal(bonuses.get('a'), 3);
  assert.equal(bonuses.get('b'), 3);
});

test('다국어 구사자는 본인이 그 권역 소속이 아니면 감면을 주지 않는다', () => {
  const p = (id, extra = {}) => makePlayer({ id, continentTag: 'europe', ...extra });
  const outsider = makePlayer({
    id: 'outsider',
    continentTag: 'southAmerica',
    specialTrait: 'polyglot',
  });
  const lineup = [p('a'), p('b'), outsider]; // 유럽 2명 + 다른 권역 다국어 구사자
  const bonuses = computeContinentSynergyBonus(lineup);
  assert.equal(bonuses.get('a') ?? 0, 0); // 감면 안 되어 2명은 미달
});

test('computePlayerFinalOVR은 baseOVR에 모든 가산을 합산한다', () => {
  const player = makePlayer({
    id: 'a',
    baseOVR: 70,
    position: 'ST',
    playstyleTags: ['gegenpressing'],
    specialTrait: 'journeyman',
    acquiredThisSeason: true,
  });
  const teammate1 = makePlayer({ id: 'b', position: 'CMF', playstyleTags: ['gegenpressing'] });
  const teammate2 = makePlayer({ id: 'c', position: 'CMF', playstyleTags: ['gegenpressing'] });
  const lineup = [player, teammate1, teammate2];
  // 70 (base) + 4 (저니맨) + 4 (게겐프레싱 3명 시너지) = 78
  assert.equal(computePlayerFinalOVR(player, lineup, []), 78);
});
