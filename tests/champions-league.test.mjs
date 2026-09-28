import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateChampionsLeague, UCL_ROUNDS, UCL_RESULT_LABELS, UCL_REWARDS_FUNDS } from '../engine/champions-league.mjs';

test('압도적으로 강하면(변동성 상한을 넘는 파워) 우승까지 간다', () => {
  const result = simulateChampionsLeague(1000, Math.random);
  assert.equal(result, 'champion');
});

test('압도적으로 약하면 16강에서 탈락한다', () => {
  const result = simulateChampionsLeague(1, Math.random);
  assert.equal(result, 'ro16');
});

test('반환값은 항상 라운드 id이거나 champion이다', () => {
  const validIds = new Set([...UCL_ROUNDS.map((r) => r.id), 'champion']);
  for (let i = 0; i < 50; i++) {
    const result = simulateChampionsLeague(90, Math.random);
    assert.ok(validIds.has(result), `unexpected result: ${result}`);
    assert.ok(UCL_RESULT_LABELS[result]);
    assert.ok(UCL_REWARDS_FUNDS[result] > 0);
  }
});

test('rng를 고정하면 결과가 결정론적이다', () => {
  const fixedRng = () => 0.5; // applyVariance가 0 변동으로 순수 파워만 비교하게 만든다
  const result = simulateChampionsLeague(89, fixedRng); // 16강 상대(86)보다 강함
  assert.equal(result, simulateChampionsLeague(89, fixedRng));
});
