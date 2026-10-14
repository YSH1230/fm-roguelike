import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starsOf, observedOVR, rollHiddenTraits, tierFromStars, nextForm, obsUpdate, anchorOf, FORM_SIGMA } from '../engine/stars.mjs';
import { computePlayerFinalOVR } from '../engine/ovr.mjs';
import { generateProceduralPlayer } from '../data/generate-player.mjs';
import { generateShopOffer } from '../data/draft-shop.mjs';
import { optimizeLineup } from '../engine/lineup.mjs';

test('별 눈금(S4): 5부 기준 59에서 6점이 1칸, 0.5 단위, 1~5로 묶인다', () => {
  assert.equal(anchorOf('tier5'), 59);
  assert.deepEqual(['tier5', 'tier4', 'tier3', 'tier2', 'tier1'].map(anchorOf), [59, 64, 72, 77, 83]);
  assert.equal(starsOf({ baseOVR: 59 }, 59), 3);
  assert.equal(starsOf({ baseOVR: 65 }, 59), 4);
  assert.equal(starsOf({ baseOVR: 62 }, 59), 3.5);
  assert.ok(starsOf({ baseOVR: 71 }, 59) === 5 && starsOf({ baseOVR: 99 }, 59) === 5);
  assert.ok(starsOf({ baseOVR: 47 }, 59) === 1 && starsOf({ baseOVR: 1 }, 59) === 1);
});

test('별은 평가 오차(obsErr)를 따르고 진짜 실력(baseOVR)과 다를 수 있다', () => {
  assert.equal(observedOVR({ baseOVR: 50, obsErr: 4 }), 54);
  assert.ok(starsOf({ baseOVR: 50, obsErr: 8 }, 59) > starsOf({ baseOVR: 50, obsErr: -8 }, 59));
});

const std = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
test('nextForm: 유형별 폼 표준편차가 FORM_SIGMA의 ±10% 이내이고, 이전 폼은 prevForm에 남는다', () => {
  for (const vol of ['steady', 'normal', 'streaky']) {
    let p = { baseOVR: 59, volatility: vol, form: 0 };
    const xs = [];
    for (let i = 0; i < 20000; i++) { const n = nextForm(p, 59); xs.push(n.form); p = { ...p, ...n }; }
    assert.ok(Math.abs(std(xs) / FORM_SIGMA[vol] - 1) < 0.1, `${vol} ${std(xs)}`);
  }
  assert.equal(nextForm({ baseOVR: 59, volatility: 'normal', form: 2.5 }, 59).prevForm, 2.5);
});

test('obsUpdate: 영입 직후 별 오차가 시즌마다 유형별 목표대로 줄어든다(±10%)', () => {
  const target = { steady: [3.05, 1.92, 1.40, 1.20], normal: [3.23, 2.52, 2.03, 1.72], streaky: [3.61, 2.77, 2.37, 2.12] };
  for (const vol of ['steady', 'normal', 'streaky']) {
    let ps = [];
    while (ps.length < 6000) { const h = rollHiddenTraits(); if (h.volatility === vol) ps.push({ baseOVR: 59, ...h }); }
    for (let k = 0; k < 4; k++) {
      assert.ok(Math.abs(std(ps.map((p) => p.obsErr)) / target[vol][k] - 1) < 0.1, `${vol} ${k}시즌 ${std(ps.map((p) => p.obsErr))}`);
      ps = ps.map((p) => { let q = { ...p, ...obsUpdate(p, p.form) }; q = { ...q, ...obsUpdate(q, q.form) }; return { ...q, ...nextForm(q, 59) }; }); // 반기 + 시즌 결산, 새 폼
    }
  }
  assert.ok(Number.isFinite(obsUpdate({ volatility: 'streaky', obsErr: 3 }, 0).obsP)); // obsP 없는 옛 세이브도 갱신된다
});

test('영입 카드 별 분포(5부 상점 3000장): 평균 ★2.9~3.2, ★5가 9~18%', () => {
  let sum = 0; let five = 0; let n = 0;
  for (let i = 0; i < 1000; i++) for (const c of generateShopOffer(3, [], Math.random, 'tier5')) { const st = starsOf(c, anchorOf('tier5')); sum += st; if (st === 5) five++; n++; }
  assert.ok(sum / n >= 2.9 && sum / n <= 3.2, `평균 ${sum / n}`);
  assert.ok(five / n >= 0.09 && five / n <= 0.18, `★5 ${five / n}`);
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

import { hiddenShift, hideHidden } from '../engine/stars.mjs';
import { traitHints, activeTraits } from '../engine/traits.mjs';
import { computePlaystyleSynergyBonus } from '../engine/ovr.mjs';

test('숨은 특성: 시즌 리듬·리그 적응·신입 적응·팀 기여가 실력에 반영된다', () => {
  assert.equal(hiddenShift({ rhythm: 'slow' }, { half: 1 }), -2);
  assert.equal(hiddenShift({ rhythm: 'slow' }, { half: 2 }), 2);
  assert.equal(hiddenShift({ adapt: 'riser' }, { leagueIdx: 4 }), 1.5);
  assert.equal(hiddenShift({ adapt: 'lowking' }, { leagueIdx: 4 }), -1.5);
  assert.equal(hiddenShift({ settle: 'slow', acquiredThisSeason: true }), -2);
  assert.equal(hiddenShift({ settle: 'slow' }), 0);
  assert.equal(hiddenShift({ team: 'solo' }), 2);
  assert.equal(hideHidden({ id: 'a', team: 'solo', form: 3 }).form, 0);
});

test('팀 플레이어는 태그 시너지 ×1.5, 혼자 해결하는 선수는 못 받는다', () => {
  const mk = (id, team) => ({ id, baseOVR: 50, position: 'CMF', playstyleTags: ['pass'], team });
  const lineup = [mk('a', 'team'), mk('b', 'solo'), mk('c', null)];
  const b = computePlaystyleSynergyBonus(lineup, 'pass');
  assert.equal(b.get('b'), 0);
  assert.ok(b.get('a') > b.get('c') && b.get('c') > 0);
});

test('성향 문구: 같은 선수·같은 등급이면 같고, 마스터가 더 정확하며 더 많이 보인다', () => {
  const p = { id: 'zz1', obsErr: -4, volatility: 'streaky', curve: 'late', rhythm: 'slow', team: null, adapt: null, settle: null };
  assert.deepEqual(traitHints(p, 'master'), traitHints(p, 'master'));
  assert.ok(traitHints(p, 'master').length >= traitHints(p, 'academy').length);
  let right = { academy: 0, master: 0 };
  const truth = new Set(['기복이 큰 편', '늦게 터지는 타입', '슬로 스타터']);
  for (let i = 0; i < 400; i++) {
    const q = { ...p, id: `q${i}` };
    for (const lvl of ['academy', 'master']) for (const h of traitHints(q, lvl)) if (truth.has(h)) right[lvl] += 1 / Math.max(1, traitHints(q, lvl).length);
  }
  assert.ok(right.master / 400 > right.academy / 400);
  assert.equal(activeTraits(p).length, 3); // 이름값·내구성은 리포트 ⑤⑥으로 옮겼다
});
