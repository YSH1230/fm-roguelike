import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSelfTraitBonus,
  computeTeamTraitBonuses,
  computePlaystyleSynergyBonus,
  computePlayerFinalOVR,
  computePlayerBonusBreakdown,
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

test('성골 유스는 드래프트 유스 출신이면 본인 +10', () => {
  const p = makePlayer({ specialTrait: 'seongGolYouth', isDraftedYouth: true });
  assert.equal(computeSelfTraitBonus(p), 10);
});

test('성골 유스는 임시 유스(드래프트 아님)면 가산 없음', () => {
  const p = makePlayer({ specialTrait: 'seongGolYouth', isDraftedYouth: false });
  assert.equal(computeSelfTraitBonus(p), 0);
});

test('홈타운 영웅은 잔류 시즌당 +4, 상한 +12', () => {
  assert.equal(
    computeSelfTraitBonus(makePlayer({ specialTrait: 'hometownHero', seasonsAtClub: 1 })),
    4
  );
  assert.equal(
    computeSelfTraitBonus(makePlayer({ specialTrait: 'hometownHero', seasonsAtClub: 5 })),
    12
  );
});

test('저니맨은 이번 시즌 영입이면 본인 +8', () => {
  assert.equal(
    computeSelfTraitBonus(makePlayer({ specialTrait: 'journeyman', acquiredThisSeason: true })),
    8
  );
  assert.equal(
    computeSelfTraitBonus(makePlayer({ specialTrait: 'journeyman', acquiredThisSeason: false })),
    0
  );
});

test('베테랑 리더는 23세 이하 라인업 전원에게 +3, 중첩 없음', () => {
  const leader = makePlayer({ id: 'leader', age: 34, specialTrait: 'veteranLeader' });
  const young1 = makePlayer({ id: 'young1', age: 20 });
  const young2 = makePlayer({ id: 'young2', age: 23 });
  const old = makePlayer({ id: 'old', age: 28 });
  const lineup = [leader, young1, young2, old];
  const bonuses = computeTeamTraitBonuses(lineup, []);
  assert.equal(bonuses.get('young1'), 3);
  assert.equal(bonuses.get('young2'), 3);
  assert.equal(bonuses.get('old') ?? 0, 0);
  assert.equal(bonuses.get('leader') ?? 0, 0);
});

test('슈퍼 서브는 벤치에 있으면 선발 전원 +1, 여러 명이어도 중첩 없음', () => {
  const starter = makePlayer({ id: 'starter' });
  const sub1 = makePlayer({ id: 'sub1', specialTrait: 'superSub', inBench: true });
  const sub2 = makePlayer({ id: 'sub2', specialTrait: 'superSub', inBench: true });
  assert.equal(computeTeamTraitBonuses([starter], [sub1]).get('starter'), 1);
  assert.equal(computeTeamTraitBonuses([starter], [sub1, sub2]).get('starter'), 1);
  assert.equal(computeTeamTraitBonuses([starter], []).get('starter') ?? 0, 0);
});

test('플레이스타일 시너지: 문턱 3/4/5명에서 어려움 태그는 +4/+9/+15, 5명 넘어도 최대값', () => {
  const make = (n) => Array.from({ length: n }, (_, i) => makePlayer({ id: `p${i}`, position: 'ST', playstyleTags: ['gegenpressing'] }));
  assert.equal(computePlaystyleSynergyBonus(make(2)).get('p0') ?? 0, 0);
  assert.equal(computePlaystyleSynergyBonus(make(3)).get('p0'), 4);
  assert.equal(computePlaystyleSynergyBonus(make(4)).get('p0'), 9);
  assert.equal(computePlaystyleSynergyBonus(make(5)).get('p0'), 15);
  assert.equal(computePlaystyleSynergyBonus(make(7)).get('p0'), 15);
});

test('기본기 태그는 약하다(+1/+2/+3)', () => {
  const make = (n) => Array.from({ length: n }, (_, i) => makePlayer({ id: `p${i}`, position: 'CB', playstyleTags: ['pass'] }));
  assert.equal(computePlaystyleSynergyBonus(make(3)).get('p0'), 1);
  assert.equal(computePlaystyleSynergyBonus(make(6)).get('p0'), 2);
});

test('플레이스타일 시너지: 3명이면 첫 값, 대상 포지션 보유자에게만', () => {
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
  // 70 (base) + 8 (저니맨) + 4 (게겐프레싱 3명 시너지) = 82
  assert.equal(computePlayerFinalOVR(player, lineup, []), 82);
});

test('같은 태그 보유자가 3명 미만이면 보너스가 없다', () => {
  const lineup = [
    makePlayer({ id: 'a', position: 'ST', playstyleTags: ['gegenpressing'] }),
    makePlayer({ id: 'b', position: 'CMF', playstyleTags: ['gegenpressing'] }),
  ];
  assert.equal(computePlaystyleSynergyBonus(lineup).get('a') ?? 0, 0);
});

test('출처별 상승 내역의 합은 최종 OVR - baseOVR과 같다', () => {
  const lineup = [
    makePlayer({ id: 'a', position: 'CMF', baseOVR: 60, age: 20, playstyleTags: ['tikiTaka'] }),
    makePlayer({ id: 'b', position: 'AMF', baseOVR: 60, playstyleTags: ['tikiTaka'] }),
    makePlayer({ id: 'c', position: 'CMF', baseOVR: 60, playstyleTags: ['tikiTaka'], specialTrait: 'veteranLeader', age: 34 }),
  ];
  const parts = computePlayerBonusBreakdown(lineup[0], lineup, []);
  const sum = parts.reduce((s, x) => s + x.value, 0);
  assert.equal(sum, computePlayerFinalOVR(lineup[0], lineup, []) - 60);
  assert.deepEqual(parts.map((x) => x.id).sort(), ['tikiTaka', 'veteranLeader']);
});

test('베테랑 리더는 선발에만 있으면 어린 선수를 올리고, 중복해도 +3 한 번', () => {
  const l1 = makePlayer({ id: 'l1', specialTrait: 'veteranLeader', age: 34 });
  const l2 = makePlayer({ id: 'l2', specialTrait: 'veteranLeader', age: 36 });
  const young = makePlayer({ id: 'young', age: 20 });
  assert.equal(computePlayerFinalOVR(young, [l1, l2, young], []), young.baseOVR + 3);
  assert.equal(computePlayerFinalOVR(young, [young], [l1]), young.baseOVR); // 벤치 리더는 효과 없음
});

test('문턱은 수혜 포지션에 선 보유자만 센다 - 포지션 밖 보유자는 인원에도 안 들어간다', () => {
  const lineup = [
    makePlayer({ id: 'a', position: 'ST', playstyleTags: ['gegenpressing'] }),
    makePlayer({ id: 'b', position: 'CMF', playstyleTags: ['gegenpressing'] }),
    makePlayer({ id: 'c', position: 'GK', playstyleTags: ['gegenpressing'] }), // 대상 포지션 아님
  ];
  assert.equal(computePlaystyleSynergyBonus(lineup).get('a') ?? 0, 0); // 3명처럼 보여도 실제 수혜자는 2명
});
