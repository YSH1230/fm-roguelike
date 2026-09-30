import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLUB_ROSTER, COLORS, KLASS, deriveClub, buildStartClubOffers, buildTierClubOffers, buildLeagueRivals } from '../data/clubs.mjs';

const TIERS = ['tier5', 'tier4', 'tier3', 'tier2', 'tier1'];

test('리그마다 20팀, 강5·중10·약5', () => {
  for (const t of TIERS) {
    const roster = CLUB_ROSTER[t];
    assert.equal(roster.length, 20, t);
    const n = (k) => roster.filter((c) => c.klass === k).length;
    assert.deepEqual([n('strong'), n('mid'), n('weak')], [5, 10, 5], t);
  }
});

test('구단 이름과 id는 전 리그에서 유일하고 색채가 유효하다', () => {
  const all = TIERS.flatMap((t) => CLUB_ROSTER[t]);
  assert.equal(all.length, 100);
  assert.equal(new Set(all.map((c) => c.name)).size, 100);
  assert.equal(new Set(all.map((c) => c.id)).size, 100);
  for (const c of all) assert.ok(COLORS[c.color], c.color);
});

test('deriveClub: 강팀 기대치 +5, 자금 배율은 유형 × 색채', () => {
  const c = deriveClub({ klass: 'strong', color: 'richOwner' });
  assert.equal(c.expectationModifier, 5);
  assert.equal(c.startingFundsMultiplier, 1.82); // 1.3 × 1.4
  assert.equal(deriveClub({ klass: 'weak', color: 'financialTrouble' }).startingFundsMultiplier, 0.6);
  assert.ok(KLASS.mid.demand);
});

test('시작 화면 오퍼: 4개, 강·중·약이 각각 하나 이상', () => {
  const offers = buildStartClubOffers();
  assert.equal(offers.length, 4);
  for (const k of ['strong', 'mid', 'weak']) assert.ok(offers.some((c) => c.klass === k), k);
  assert.ok(offers.every((c) => c.tierId === 'tier5'));
  assert.equal(new Set(offers.map((c) => c.id)).size, 4);
});

test('승격 오퍼: 강·중·약 각 1개', () => {
  const offers = buildTierClubOffers('tier3', 3);
  assert.deepEqual(offers.map((c) => c.klass).sort(), ['mid', 'strong', 'weak']);
});

test('리그 상대 구단은 중복 없이 뽑는다', () => {
  const r = buildLeagueRivals('tier2', 19);
  assert.equal(new Set(r.map((c) => c.id)).size, 19);
});
