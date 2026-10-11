import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIALTIES, SPECIALTY_IDS, MAX_SPECIALTIES, drawSpecialtyChoices, pickSpecialty, specialtyEffects, specialtyLevel, tenureChemistry } from '../engine/specialties.mjs';
import { TAG_IDS } from '../engine/constants.mjs';

test('특기는 16종이고 모두 Lv1·Lv2 효과와 설명이 있다', () => {
  assert.equal(SPECIALTY_IDS.length, 16);
  for (const id of SPECIALTY_IDS) {
    const s = SPECIALTIES[id];
    assert.equal(s.effects.length, 2, id);
    assert.equal(s.lv.length, 2, id);
    assert.ok(s.name && s.blurb, id);
  }
  // 태그 스승 6종은 태그 6종과 하나씩 짝이다
  const tags = SPECIALTY_IDS.map((id) => SPECIALTIES[id].tag).filter((t) => t && t !== undefined && TAG_IDS.includes(t)).sort();
  assert.deepEqual(tags, [...TAG_IDS].sort());
});

test('첫 특기 후보는 초반부터 체감되는 것만 나오고 3장이다', () => {
  for (let i = 0; i < 200; i++) {
    const c = drawSpecialtyChoices([], Math.random, { firstPick: true });
    assert.equal(c.length, 3);
    assert.ok(c.every((x) => SPECIALTIES[x.id].early && x.level === 1 && !x.upgrade));
  }
});

test('이미 가진 Lv1 특기는 강화(Lv2) 카드로 나오고, Lv2는 다시 안 나온다', () => {
  let owned = pickSpecialty([], 'hairdryer');
  owned = pickSpecialty(owned, 'hairdryer');
  assert.equal(specialtyLevel(owned, 'hairdryer'), 2);
  for (let i = 0; i < 100; i++) assert.ok(!drawSpecialtyChoices(owned).some((c) => c.id === 'hairdryer'));
  const lv1 = pickSpecialty([], 'catenaccio');
  const seen = new Set();
  for (let i = 0; i < 300; i++) for (const c of drawSpecialtyChoices(lv1)) if (c.id === 'catenaccio') seen.add(c.upgrade && c.level === 2);
  assert.deepEqual([...seen], [true]);
});

test('5개를 채우면 새 특기는 안 나오고 강화만 나온다', () => {
  let owned = [];
  for (const id of ['hairdryer', 'catenaccio', 'lateSurge', 'marketMaster', 'dataAnalyst']) owned = pickSpecialty(owned, id);
  assert.equal(owned.length, MAX_SPECIALTIES);
  for (let i = 0; i < 100; i++) assert.ok(drawSpecialtyChoices(owned).every((c) => c.upgrade));
});

test('효과를 한 객체로 합친다: 같은 값은 더하고, 오차 배율은 가장 작은 쪽, 압박 배율은 큰 쪽', () => {
  let owned = [];
  for (const id of ['pressing', 'pressing', 'hairdryer', 'marketMaster', 'dataAnalyst', 'totalFootball']) owned = pickSpecialty(owned, id);
  const fx = specialtyEffects(owned);
  assert.equal(fx.tagBonus.press, 3); // Lv2
  assert.equal(fx.startChemistry, 4);
  assert.equal(fx.buyDiscount, 0.07);
  assert.equal(fx.pressureMult, 2);
  assert.equal(fx.gradeNoiseMult, 0.6);
  assert.equal(fx.formationBonus, 3);
  assert.equal(specialtyEffects([]).formationBonus, 0);
  assert.equal(specialtyEffects(null).pressureMult, 1);
});

test('구단의 아버지: 시즌 수에 비례하고 상한이 있다', () => {
  const fx = specialtyEffects(pickSpecialty([], 'clubFather'));
  assert.equal(tenureChemistry(fx, 1), 2);
  assert.equal(tenureChemistry(fx, 3), 6);
  assert.equal(tenureChemistry(fx, 10), 6);
  assert.equal(tenureChemistry(specialtyEffects([]), 5), 0);
});
