import { test } from 'node:test';
import assert from 'node:assert/strict';
import { switchPhilosophy, PHILOSOPHY_IDS, specialtyEffects } from '../engine/specialties.mjs';

test('철학: 8종이고, 바꾸면 새 철학은 max(1, 현재 Lv−2)로 시작한다', () => {
  assert.equal(PHILOSOPHY_IDS.length, 8);
  assert.deepEqual(switchPhilosophy({ id: 'a', level: 5 }, 'b'), { id: 'b', level: 3 });
  assert.deepEqual(switchPhilosophy({ id: 'a', level: 2 }, 'b'), { id: 'b', level: 1 });
  assert.deepEqual(switchPhilosophy({ id: 'a', level: 1 }, 'b'), { id: 'b', level: 1 });
});

test('라커룸 토크 삭제 뒤: 철학이 없으면 효과는 모두 중립이다', () => {
  const fx = specialtyEffects(null);
  assert.equal(fx.formationBonus, 0);
  assert.equal(fx.txDecayMult, 1);
  assert.equal(fx.buyDiscount, 0);
  assert.equal(fx.saleMult, 1);
  assert.equal(fx.pointsFirst, 0);
  assert.equal(fx.pointsSecond, 0);
  assert.equal(fx.recoveryDelta, 0);
  assert.equal(fx.growthBoost, 0);
});
