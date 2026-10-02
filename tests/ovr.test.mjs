import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSelfTraitBonus,
  computeTeamTraitBonuses,
  computePlaystyleSynergyBonus,
  computeContinentSynergyBonus,
  computePlayerFinalOVR,
  computePlayerBonusBreakdown,
  autoRoles,
  resolveRoles,
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

test('슈퍼 서브는 벤치 1명당 선발 전원 +2, 여러 명이어도 최대 +4', () => {
  const starter = makePlayer({ id: 'starter' });
  const sub1 = makePlayer({ id: 'sub1', specialTrait: 'superSub', inBench: true });
  const sub2 = makePlayer({ id: 'sub2', specialTrait: 'superSub', inBench: true });
  const sub3 = makePlayer({ id: 'sub3', specialTrait: 'superSub', inBench: true });
  assert.equal(computeTeamTraitBonuses([starter], [sub1]).get('starter'), 2);
  assert.equal(computeTeamTraitBonuses([starter], [sub1, sub2]).get('starter'), 4);
  assert.equal(computeTeamTraitBonuses([starter], [sub1, sub2, sub3]).get('starter'), 4);
});

test('플레이스타일 시너지: 문턱 3/4/5명에서 어려움 태그는 +3/+7/+12, 5명 넘어도 최대값', () => {
  const make = (n) => Array.from({ length: n }, (_, i) => makePlayer({ id: `p${i}`, position: 'ST', playstyleTags: ['gegenpressing'] }));
  assert.equal(computePlaystyleSynergyBonus(make(2)).get('p0') ?? 0, 0);
  assert.equal(computePlaystyleSynergyBonus(make(3)).get('p0'), 3);
  assert.equal(computePlaystyleSynergyBonus(make(4)).get('p0'), 7);
  assert.equal(computePlaystyleSynergyBonus(make(5)).get('p0'), 12);
  assert.equal(computePlaystyleSynergyBonus(make(7)).get('p0'), 12);
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
  assert.equal(bonuses.get('a'), 3);
  assert.equal(bonuses.get('b'), 3);
  assert.equal(bonuses.get('c'), 3);
  assert.equal(bonuses.get('d') ?? 0, 0);
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
  // 70 (base) + 8 (저니맨, 에이스 슬롯 자동 배정) + 3 (게겐프레싱 3명 시너지) = 81
  assert.equal(computePlayerFinalOVR(player, lineup, []), 81);
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
    makePlayer({ id: 'a', position: 'CMF', baseOVR: 60, age: 20, continentTag: 'europe', playstyleTags: ['tikiTaka'] }),
    makePlayer({ id: 'b', position: 'AMF', baseOVR: 60, continentTag: 'europe', playstyleTags: ['tikiTaka'] }),
    makePlayer({ id: 'c', position: 'CMF', baseOVR: 60, continentTag: 'europe', playstyleTags: ['tikiTaka'], specialTrait: 'veteranLeader', age: 34 }),
  ];
  const parts = computePlayerBonusBreakdown(lineup[0], lineup, []);
  const sum = parts.reduce((s, x) => s + x.value, 0);
  assert.equal(sum, computePlayerFinalOVR(lineup[0], lineup, []) - 60);
  assert.deepEqual(parts.map((x) => x.id).sort(), ['europe', 'tikiTaka', 'veteranLeader']);
});

// ---- 역할 슬롯 ----
const T = (id, trait, extra = {}) => makePlayer({ id, specialTrait: trait, ...extra });

test('에이스 슬롯: 후보가 여럿이면 라인업 OVR을 가장 크게 올리는 한 명만 발동한다', () => {
  const star = T('star', 'starPower');
  const journey = T('journey', 'journeyman', { acquiredThisSeason: true });
  const lineup = [star, journey, makePlayer({ id: 'x' })];
  const roles = autoRoles(lineup, []);
  assert.equal(roles.ace, 'star'); // +10 > +8
  assert.equal(computePlayerFinalOVR(star, lineup, [], null, roles), star.baseOVR + 10);
  assert.equal(computePlayerFinalOVR(journey, lineup, [], null, roles), journey.baseOVR); // 밀린 태그는 0
});

test('슬롯 밖(벤치의 에이스 후보/선발의 조커 후보)은 배정되지 않는다', () => {
  const star = T('star', 'starPower');
  const sub = T('sub', 'superSub');
  const roles = autoRoles([makePlayer({ id: 'x' }), sub], [star]);
  assert.equal(roles.ace, null);
  assert.equal(roles.joker, null);
});

test('조커 슬롯: 벤치 슈퍼 서브 한 명이 선발 전원 +1(중첩 없음)', () => {
  const lineup = [makePlayer({ id: 'a' }), makePlayer({ id: 'b' })];
  const bench = [T('s1', 'superSub'), T('s2', 'superSub')];
  const roles = autoRoles(lineup, bench);
  assert.ok(roles.joker);
  assert.equal(computePlayerFinalOVR(lineup[0], lineup, bench, null, roles), lineup[0].baseOVR + 1);
});

test('베테랑 리더는 주장 슬롯이어야 어린 선수를 올린다', () => {
  const leader = T('leader', 'veteranLeader', { age: 34 });
  const young = makePlayer({ id: 'young', age: 20 });
  const lineup = [leader, young];
  assert.equal(computePlayerFinalOVR(young, lineup, [], null, { captain: null, ace: null, joker: null }), young.baseOVR);
  assert.equal(computePlayerFinalOVR(young, lineup, [], null, { captain: 'leader', ace: null, joker: null }), young.baseOVR + 3);
});

test('폴리글롯 대가: 주장으로 뛰는 본인은 대륙 케미를 받지 못한다', () => {
  const poly = T('poly', 'polyglot', { continentTag: 'europe' });
  const mate = makePlayer({ id: 'mate', continentTag: 'europe' });
  const lineup = [poly, mate]; // 유럽 2명 + 폴리글롯 감면으로 3명 문턱(요구 2명) 충족
  const withRole = { captain: 'poly', ace: null, joker: null };
  assert.equal(computePlayerFinalOVR(mate, lineup, [], null, withRole), mate.baseOVR + 3);
  assert.equal(computePlayerFinalOVR(poly, lineup, [], null, withRole), poly.baseOVR); // 본인은 못 받음
});

test('자동 배정이 오히려 손해면(폴리글롯이 혼자 있을 때) 슬롯을 비워 둔다', () => {
  const poly = T('poly', 'polyglot', { continentTag: 'europe' });
  // 유럽 5명이라 폴리글롯 없이도 최고 단계 → 주장에 세우면 본인만 보너스를 잃는다
  const lineup = [poly, ...['a', 'b', 'c', 'd'].map((id) => makePlayer({ id, continentTag: 'europe' }))];
  assert.equal(autoRoles(lineup, []).captain, null);
});

test('resolveRoles: 유저 지정이 자동을 덮고, none은 비우고, 자격 없는 지정은 무시한다', () => {
  const star = T('star', 'starPower');
  const journey = T('journey', 'journeyman', { acquiredThisSeason: true });
  const lineup = [star, journey, makePlayer({ id: 'x' })];
  assert.equal(resolveRoles({ ace: 'journey' }, lineup, []).ace, 'journey');
  assert.equal(resolveRoles({ ace: 'none' }, lineup, []).ace, null);
  assert.equal(resolveRoles({ ace: 'x' }, lineup, []).ace, 'star'); // x는 에이스 태그가 없다 → 자동값
});

test('문턱은 수혜 포지션에 선 보유자만 센다 - 포지션 밖 보유자는 인원에도 안 들어간다', () => {
  const lineup = [
    makePlayer({ id: 'a', position: 'ST', playstyleTags: ['gegenpressing'] }),
    makePlayer({ id: 'b', position: 'CMF', playstyleTags: ['gegenpressing'] }),
    makePlayer({ id: 'c', position: 'GK', playstyleTags: ['gegenpressing'] }), // 대상 포지션 아님
  ];
  assert.equal(computePlaystyleSynergyBonus(lineup).get('a') ?? 0, 0); // 3명처럼 보여도 실제 수혜자는 2명
});
