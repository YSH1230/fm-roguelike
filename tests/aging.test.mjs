import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageSquad, ovrChangeRange, retireChance, bodyAge, ageTrend, agePriceMult, LEAP_BONUS, FORCED_RETIRE_AGE } from '../engine/aging.mjs';

const mk = (id, age, baseOVR = 60) => ({ id, name: `P${id}`, age, baseOVR });

test('나이가 어릴수록 크게 오르고, 많을수록 크게 떨어진다', () => {
  const mid = (a) => { const [lo, hi] = ovrChangeRange(a); return (lo + hi) / 2; };
  assert.ok(mid(19) > mid(24) && mid(24) > mid(27));
  assert.ok(mid(27) > mid(30) && mid(30) > mid(33) && mid(33) > mid(36));
  assert.ok(ovrChangeRange(19)[0] > 0);
  assert.ok(ovrChangeRange(35)[1] < 0);
});

test('모든 선수의 나이가 1 오르고 OVR 변화는 범위 안이다', () => {
  for (let i = 0; i < 100; i++) {
    const squad = [mk('a', 18), mk('b', 25), mk('c', 31), mk('d', 34)];
    const { squad: out } = ageSquad(squad, Math.random);
    for (const p of out) {
      const old = squad.find((s) => s.id === p.id);
      assert.equal(p.age, old.age + 1);
      const [lo, hi] = ovrChangeRange(old.age);
      assert.ok(p.baseOVR - old.baseOVR >= Math.min(lo, 0) && p.baseOVR - old.baseOVR <= hi + LEAP_BONUS); // 정체/도약 반영
    }
  }
});

test('37세 이상은 반드시 은퇴하고 35~36세는 확률로 은퇴한다', () => {
  assert.equal(retireChance(FORCED_RETIRE_AGE), 1);
  assert.equal(retireChance(34), 0);
  assert.ok(retireChance(35) > 0 && retireChance(36) > retireChance(35));
  const { squad, retired } = ageSquad([mk('old', 36), mk('young', 20)], () => 0.99);
  assert.equal(retired.length, 1); // 36 -> 37세가 되면서 확정 은퇴
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
  assert.equal(bodyAge(34, 'CB'), 33);
  assert.equal(bodyAge(34, 'ST'), 35);
  assert.ok(ovrChangeRange(34, 'GK')[0] > ovrChangeRange(34, 'ST')[0]);
  assert.equal(retireChance(bodyAge(36, 'GK')), 0); // 36세 골키퍼는 아직 안 은퇴
});

test('도약(+2)과 정체(0 이하)', () => {
  const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
  // rng: 은퇴 굴림(0.99 안전), 변화 굴림 0(=lo), 도약 굴림 0.05
  const leap = ageSquad([mk('a', 24, 60)], seq(0.99, 0, 0.05)).squad[0];
  assert.equal(leap.baseOVR, 60 + 0 + LEAP_BONUS);
  const stall = ageSquad([mk('b', 19, 60)], seq(0.99, 0.99, 0.15)).squad[0];
  assert.equal(stall.baseOVR, 60); // 원래 +4 가능하지만 정체라 0
});

test('추세 화살표와 나이별 가격', () => {
  assert.equal(ageTrend(19, 'ST'), '↗');
  assert.equal(ageTrend(27, 'CMF'), '→');
  assert.equal(ageTrend(34, 'ST'), '↘');
  assert.equal(agePriceMult(20), 1.15);
  assert.equal(agePriceMult(27), 1);
  assert.equal(agePriceMult(34), 0.85);
});
