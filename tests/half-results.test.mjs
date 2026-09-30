import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateHalfResults, MATCHES_PER_HALF } from '../engine/half-results.mjs';

const pts = (r) => r.at(-1).points;

test('19경기이고 누적 승점이 입력 승점과 정확히 같다', () => {
  for (const p of [0, 1, 9, 27, 27.4, 40, 55, 57]) {
    const r = generateHalfResults(p);
    assert.equal(r.length, MATCHES_PER_HALF);
    assert.equal(pts(r), Math.round(p), `points ${p}`);
  }
});

test('만들 수 없는 승점(56)은 가장 가까운 아래 값으로 내린다', () => {
  const r = generateHalfResults(56);
  assert.ok(pts(r) <= 55 && pts(r) >= 54);
  assert.equal(r.length, MATCHES_PER_HALF);
});

test('결과와 스코어가 일치한다(승은 득점>실점, 패는 반대, 무는 같다)', () => {
  const r = generateHalfResults(30, () => 0.37);
  for (const m of r) {
    if (m.result === 'W') assert.ok(m.gf > m.ga);
    if (m.result === 'L') assert.ok(m.gf < m.ga);
    if (m.result === 'D') assert.equal(m.gf, m.ga);
  }
});

test('누적 승점은 경기마다 단조 증가하고 승/무/패 수가 승점과 맞는다', () => {
  const r = generateHalfResults(33);
  const w = r.filter((m) => m.result === 'W').length;
  const d = r.filter((m) => m.result === 'D').length;
  assert.equal(3 * w + d, pts(r));
  for (let i = 1; i < r.length; i++) assert.ok(r[i].points >= r[i - 1].points);
});

test('리그 순위표: 내 최종 누적 승점이 입력과 같고, 페이스에 맞는 순위에 자리 잡는다', async () => {
  const { simulateLeagueTable, rankingAt } = await import('../engine/half-results.mjs');
  const tier = { safePoints: 38, targetPoints: 68, championPoints: 80 };
  for (const [pts, maxRank, minRank] of [[42, 2, 1], [34, 5, 2], [19, 17, 10], [8, 20, 17]]) {
    const table = simulateLeagueTable(pts, tier);
    const me = table.find((t) => t.id === 'me');
    assert.equal(me.cumulative.at(-1), pts);
    assert.equal(table.length, 20);
    const rank = rankingAt(table, 19).indexOf('me') + 1;
    assert.ok(rank >= minRank && rank <= maxRank, `pts ${pts} -> rank ${rank}`);
  }
});
