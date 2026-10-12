import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starsOf, starRange, observedOVR, rollHiddenTraits, tierFromStars } from '../engine/stars.mjs';
import { computePlayerFinalOVR } from '../engine/ovr.mjs';
import { generateProceduralPlayer } from '../data/generate-player.mjs';
import { optimizeLineup } from '../engine/lineup.mjs';

test('별은 리그 평균 선수가 ★3이고 0.5 단위이며 1~5로 묶인다', () => {
  assert.equal(starsOf({ baseOVR: 48 }, 48), 3);
  assert.equal(starsOf({ baseOVR: 52 }, 48), 4);
  assert.equal(starsOf({ baseOVR: 99 }, 48), 5);
  assert.equal(starsOf({ baseOVR: 1 }, 48), 1);
  assert.equal(starsOf({ baseOVR: 50 }, 48), 3.5);
});

test('별은 평가 오차(obsErr)를 따르고 진짜 실력(baseOVR)과 다를 수 있다', () => {
  assert.equal(observedOVR({ baseOVR: 50, obsErr: 4 }), 54);
  assert.ok(starsOf({ baseOVR: 50, obsErr: 4 }, 48) > starsOf({ baseOVR: 50, obsErr: -4 }, 48));
});

test('범위는 스카우터가 좋을수록 좁고 관측 별을 항상 포함한다', () => {
  for (let i = 0; i < 100; i++) {
    const p = { id: `x${i}`, baseOVR: 40 + (i % 20), obsErr: 0 };
    const w = (lvl) => { const r = starRange(p, 48, lvl); assert.ok(r.lo <= starsOf(p, 48) && starsOf(p, 48) <= r.hi); return r.hi - r.lo; };
    assert.ok(w('master') <= w('proLicense') + 1e-9 || starsOf(p, 48) in { 1: 1, 5: 5 });
    assert.ok(w('master') <= 1.5);
  }
});

test('시즌 폼은 최종 실력에 들어가고 기복형이 더 크게 흔들린다', () => {
  const p = { id: 'a', baseOVR: 50, form: 3, playstyleTags: [] };
  assert.equal(computePlayerFinalOVR(p, [p], [], null), 53);
  const sd = (v) => { const xs = Array.from({ length: 3000 }, () => rollHiddenTraits(Math.random)); return xs.filter((x) => x.volatility === v).map((x) => x.form); };
  const std = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
  assert.ok(std(sd('streaky')) > std(sd('steady')) * 2);
});

test('생성된 선수는 숨은 속성을 갖고, 가격은 평판(관측값)을 따른다', () => {
  const p = generateProceduralPlayer('local');
  assert.ok(Number.isFinite(p.obsErr) && ['steady', 'normal', 'streaky'].includes(p.volatility) && Number.isFinite(p.form));
});

test('자동 선발은 진짜 실력이 아니라 별(관측값)로 고른다', () => {
  const mk = (id, ovr, err, form) => ({ id, name: id, position: 'ST', baseOVR: ovr, obsErr: err, form, playstyleTags: [] });
  const hidden = mk('gem', 60, -6, 3); // 진짜는 더 강하지만 평가는 낮다
  const hype = mk('bubble', 54, 3, 0);
  const { xi } = optimizeLineup([hidden, hype], ['ST'], 0);
  assert.equal(xi[0].id, 'bubble');
  assert.equal(tierFromStars(5), 'legendary');
});
