import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyRecords, loadRecords, saveRecords, recordRunStart, recordPromotion, recordSeason, recordUcl,
  uclReached, ACHIEVEMENTS, newlyUnlocked, unlockedIds,
} from '../data/records.mjs';

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

test('저장/불러오기: 빈 저장소는 기본값, 저장한 값은 그대로 돌아온다', () => {
  const st = fakeStorage();
  assert.deepEqual(loadRecords(st), emptyRecords());
  const r = recordRunStart(emptyRecords());
  saveRecords(st, r);
  assert.equal(loadRecords(st).runs, 1);
});

test('시즌 기록: 우승하면 그 리그 우승 횟수가 오르고 최고 리그가 갱신된다', () => {
  let r = emptyRecords();
  r = recordSeason(r, { season: 1, club: 'A', tierId: 'tier5', result: 'champion', rank: 1, points: 80 });
  r = recordSeason(r, { season: 2, club: 'A', tierId: 'tier4', result: 'safe', rank: 9, points: 50 });
  assert.equal(r.titles.tier5, 1);
  assert.equal(r.titles.tier4, 0);
  assert.equal(r.highestTier, 'tier4');
  assert.equal(r.seasons, 2);
  assert.equal(r.history.length, 2);
});

test('챔스 기록: 같은 시즌 기록에 결과가 붙고 1부 우승과 챔스 우승이 겹치면 더블', () => {
  let r = emptyRecords();
  r = recordSeason(r, { season: 7, club: 'A', tierId: 'tier1', result: 'champion', rank: 1, points: 95 });
  r = recordUcl(r, { result: 'champion', season: 7 });
  assert.equal(r.history.at(-1).ucl, 'champion');
  assert.equal(r.doubles, 1);
  assert.equal(r.ucl.champion, 1);
  assert.equal(r.uclEntries, 1);
});

test('uclReached: 그 라운드 이상 진출 횟수', () => {
  let r = emptyRecords();
  for (const res of ['league', 'r16', 'qf', 'sf', 'champion']) r = recordUcl(r, { result: res, season: 1 });
  assert.equal(uclReached(r, 'r16'), 4);
  assert.equal(uclReached(r, 'qf'), 3);
  assert.equal(uclReached(r, 'sf'), 2);
  assert.equal(uclReached(r, 'final'), 1);
});

test('업적: 조건을 채우면 풀리고, newlyUnlocked는 이번에 새로 풀린 것만 돌려준다', () => {
  const before = emptyRecords();
  assert.equal(unlockedIds(before).length, 0);
  let after = recordPromotion(before);
  assert.deepEqual(newlyUnlocked(before, after).map((a) => a.id), ['escape5']);
  const again = recordPromotion(after);
  assert.equal(newlyUnlocked(after, again).length, 0);
  assert.ok(ACHIEVEMENTS.every((a) => a.id && a.label && a.desc && typeof a.check === 'function'));
});
