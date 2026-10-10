import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageSquad, ovrChangeRange, retireChance, bodyAge, playerTrend, agePriceMult,
  generatePotential, ensurePotential, hasPeaked, LEAP_BONUS, FORCED_RETIRE_AGE,
} from '../engine/aging.mjs';

const mk = (id, age, baseOVR = 60, extra = {}) => ({ id, name: `P${id}`, age, baseOVR, position: 'CMF', ...extra });

test('나이가 어릴수록 크게 오르고, 많을수록 크게 떨어진다(전성기 이후 곡선)', () => {
  const mid = (a) => { const [lo, hi] = ovrChangeRange(a); return (lo + hi) / 2; };
  assert.ok(mid(19) > mid(24) && mid(24) > mid(27));
  assert.ok(mid(27) > mid(30) && mid(30) > mid(33) && mid(33) > mid(36));
});

test('전성기: 어린 선수일수록 올라갈 여지가 크고, 이미 전성기를 지난 선수는 0이다', () => {
  let young = 0; let old = 0;
  for (let i = 0; i < 300; i++) {
    young += generatePotential(60, 19, 'CMF').peakOVR - 60;
    old += generatePotential(60, 31, 'CMF').peakOVR - 60;
  }
  assert.ok(young / 300 > 8, `19세 평균 성장 여지 ${young / 300}`);
  assert.equal(old, 0);
  const p = generatePotential(60, 19, 'CMF');
  assert.ok(p.peakBodyAge >= 25 && p.peakBodyAge <= 28);
});

test('전성기를 향해 올라가서 전성기 나이에 거의 도달한다', () => {
  let err = 0; const n = 200;
  for (let i = 0; i < n; i++) {
    let p = ensurePotential(mk('a', 19, 55));
    const target = p.peakOVR; const peakAge = 19 + (p.peakBodyAge - bodyAge(19, 'CMF'));
    while (p.age < peakAge) p = ageSquad([p], () => 0.5).squad[0];
    err += Math.abs(p.baseOVR - target);
  }
  assert.ok(err / n < 4, `평균 오차 ${err / n}`);
});

test('모든 선수의 나이가 1 오르고 OVR은 1~99다', () => {
  for (let i = 0; i < 100; i++) {
    const squad = [mk('a', 18), mk('b', 25), mk('c', 31), mk('d', 34)];
    const { squad: out } = ageSquad(squad, Math.random);
    for (const p of out) {
      assert.equal(p.age, squad.find((s) => s.id === p.id).age + 1);
      assert.ok(p.baseOVR >= 1 && p.baseOVR <= 99);
    }
  }
});

test('전성기에 처음 닿는 시즌이 peaked에 담긴다', () => {
  const p = { ...mk('a', 24, 70), peakOVR: 76, peakBodyAge: 25 };
  const { peaked } = ageSquad([p], () => 0.5);
  assert.equal(peaked.length, 1);
  assert.ok(hasPeaked({ ...p, age: 25 }));
});

test('37세 이상은 반드시 은퇴하고 35~36세는 확률로 은퇴한다', () => {
  assert.equal(retireChance(FORCED_RETIRE_AGE), 1);
  assert.equal(retireChance(34), 0);
  assert.ok(retireChance(35) > 0 && retireChance(36) > retireChance(35));
  const { squad, retired } = ageSquad([mk('old', 36), mk('young', 20)], () => 0.99);
  assert.equal(retired.length, 1);
  assert.equal(retired[0].id, 'old');
  assert.equal(squad.length, 1);
});

test('OVR은 1~99로 제한되고, 변화가 있었던 선수만 changes에 담긴다', () => {
  const { squad, changes } = ageSquad([mk('hi', 19, 98), mk('lo', 34, 2)], () => 0.99);
  assert.ok(squad.every((p) => p.baseOVR >= 1 && p.baseOVR <= 99));
  assert.ok(changes.every((c) => c.delta !== 0));
});

test('포지션별 노화: 골키퍼는 늦게, 공격수는 빨리 늙는다', () => {
  assert.equal(bodyAge(34, 'GK'), 31);
  assert.equal(bodyAge(34, 'ST'), 35);
  assert.ok(ovrChangeRange(34, 'GK')[0] > ovrChangeRange(34, 'ST')[0]);
  assert.equal(retireChance(bodyAge(36, 'GK')), 0);
});

test('도약(+2)은 변화에 더해진다', () => {
  const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
  const p = { ...mk('a', 28, 60), peakOVR: 60, peakBodyAge: 26 };
  const leap = ageSquad([p], seq(0.99, 0.5, 0.05)).squad[0];
  assert.ok(leap.baseOVR >= 60 + LEAP_BONUS - 1);
});

test('추세 화살표와 33세 이상 가격 보정', () => {
  assert.equal(playerTrend({ age: 19, position: 'ST', baseOVR: 55, peakOVR: 70, peakBodyAge: 26 }), '↗');
  assert.equal(playerTrend({ age: 27, position: 'CMF', baseOVR: 70, peakOVR: 70, peakBodyAge: 26 }), '→');
  assert.equal(playerTrend({ age: 34, position: 'ST', baseOVR: 70, peakOVR: 70, peakBodyAge: 26 }), '↘');
  assert.equal(agePriceMult(20), 1);
  assert.equal(agePriceMult(34), 0.85);
});
