import test from 'node:test';
import assert from 'node:assert/strict';
import { teamRatings, modifier } from '../engine/ratings.mjs';

const coaches = (a, d) => ({ attack: { stars: a }, defense: { stars: d } });
const player = (position, attrs, extra = {}) => ({ position, attrs, mood: 70, condition: 100, ...extra });
const fw = (v, extra) => player('FW', { shooting: v, pace: v, dribbling: v, stamina: v }, extra);
const mf = (passing, workrate, extra) => player('MF', { passing, vision: passing, workrate, stamina: workrate }, extra);
const df = (v, extra) => player('DF', { tackling: v, marking: v, heading: v, stamina: v }, extra);
const gk = (v, extra) => player('GK', { reflexes: v, handling: v, positioning: v, stamina: v }, extra);

test('스타가 없으면 코치 기본 레이팅만 남는다', () => {
  assert.deepEqual(teamRatings({ coaches: coaches(3, 2), stars: [] }), { attack: 36, defense: 24 });
});

test('공격수는 공격력만 올린다', () => {
  const base = teamRatings({ coaches: coaches(3, 3), stars: [] });
  const r = teamRatings({ coaches: coaches(3, 3), stars: [fw(90)] });
  assert.ok(r.attack > base.attack);
  assert.equal(r.defense, base.defense);
});

test('수비수와 골키퍼는 수비력만 올린다', () => {
  const base = teamRatings({ coaches: coaches(3, 3), stars: [] });
  const r = teamRatings({ coaches: coaches(3, 3), stars: [df(90), gk(90)] });
  assert.equal(r.attack, base.attack);
  assert.ok(r.defense > base.defense + 10);
});

test('미드필더는 패스·시야는 공격력, 활동량·체력은 수비력에 반영된다', () => {
  const base = teamRatings({ coaches: coaches(3, 3), stars: [] });
  const playmaker = teamRatings({ coaches: coaches(3, 3), stars: [mf(95, 20)] });
  assert.ok(playmaker.attack > base.attack);
  assert.equal(playmaker.defense, base.defense);
  const runner = teamRatings({ coaches: coaches(3, 3), stars: [mf(20, 95)] });
  assert.equal(runner.attack, base.attack);
  assert.ok(runner.defense > base.defense);
});

test('능력이 30 이하인 스타는 보너스가 없다', () => {
  const base = teamRatings({ coaches: coaches(3, 3), stars: [] });
  assert.deepEqual(teamRatings({ coaches: coaches(3, 3), stars: [fw(25)] }), base);
});

test('사기와 컨디션이 낮으면 기여가 줄어든다', () => {
  const good = teamRatings({ coaches: coaches(3, 3), stars: [fw(90, { mood: 100, condition: 100 })] });
  const bad = teamRatings({ coaches: coaches(3, 3), stars: [fw(90, { mood: 10, condition: 20 })] });
  assert.ok(good.attack > bad.attack);
  assert.ok(modifier({ mood: 100, condition: 100 }) > modifier({ mood: 0, condition: 0 }));
});

test('사기·컨디션 극단값에서도 보정 배율은 0.68~1.15 범위다', () => {
  assert.ok(Math.abs(modifier({ mood: 0, condition: 0 }) - 0.85 * 0.8) < 1e-9);
  assert.ok(Math.abs(modifier({ mood: 100, condition: 100 }) - 1.15) < 1e-9);
});
