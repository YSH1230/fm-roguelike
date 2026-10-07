import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeRunOutcome, nextMissedTargetCount, computeReputation, reputationBreakdown } from '../engine/run.mjs';
import { MISSED_TARGET_LIMIT } from '../engine/constants.mjs';

test('안전 승점 미달이면 즉시 해임으로 런이 끝난다', () => {
  const out = judgeRunOutcome({ seasonResult: 'relegation', leagueTierId: 'tier5', missedTargetCount: 0 });
  assert.equal(out.ended, true);
  assert.equal(out.reason, 'relegation');
  assert.equal(out.canPromote, false);
});

test('1부 우승은 런을 끝내지 않는다(계속 도전하거나 직접 은퇴한다)', () => {
  const out = judgeRunOutcome({ seasonResult: 'champion', leagueTierId: 'tier1', missedTargetCount: 0 });
  assert.equal(out.ended, false);
  assert.equal(out.reason, null);
  assert.equal(out.canPromote, false);
});

test('1부가 아닌 곳의 우승은 런을 끝내지 않고 승격을 연다', () => {
  const out = judgeRunOutcome({ seasonResult: 'champion', leagueTierId: 'tier5', missedTargetCount: 0 });
  assert.equal(out.ended, false);
  assert.equal(out.reason, null);
  assert.equal(out.canPromote, true);
});

test('1부 잔류는 런을 끝내지 않지만 승격도 못 한다', () => {
  const out = judgeRunOutcome({ seasonResult: 'safe', leagueTierId: 'tier1', missedTargetCount: 0 });
  assert.equal(out.ended, false);
  assert.equal(out.canPromote, false);
});

test('목표 미달이 한도에 닿으면 해임된다', () => {
  const out = judgeRunOutcome({
    seasonResult: 'safe', leagueTierId: 'tier5', missedTargetCount: MISSED_TARGET_LIMIT,
  });
  assert.equal(out.ended, true);
  assert.equal(out.reason, 'missedTargets');
});

test('목표 미달이 한도 직전이면 아직 런이 이어진다', () => {
  const out = judgeRunOutcome({
    seasonResult: 'safe', leagueTierId: 'tier5', missedTargetCount: MISSED_TARGET_LIMIT - 1,
  });
  assert.equal(out.ended, false);
});

test('목표 미달 누적은 잔류에서만 오르고 승격권 이상에서 초기화된다', () => {
  assert.equal(nextMissedTargetCount('safe', 0), 1);
  assert.equal(nextMissedTargetCount('safe', 2), 3);
  assert.equal(nextMissedTargetCount('promotion', 2), 0);
  assert.equal(nextMissedTargetCount('champion', 2), 0);
});

test('해임된 시즌의 누적은 올리지 않는다(런이 이미 끝났다)', () => {
  assert.equal(nextMissedTargetCount('relegation', 1), 1);
});

test('명예 점수: 도달 리그 + 버틴 시즌 + 리그별 우승 + 연속 우승 + 챔피언스리그 + 더블', () => {
  // 5부 도달(10), 아무것도 안 함
  assert.equal(computeReputation({ highestTierId: 'tier5' }), 10);
  const stats = {
    highestTierId: 'tier1', seasons: 12, titlesByTier: { tier5: 1, tier1: 2 }, streakPoints: 25,
    uclResults: { sf: 1, champion: 1 }, doubles: 1,
  };
  // 50 + 36 + (20 + 140) + 25 + (65 + 170) + 100
  assert.equal(computeReputation(stats), 50 + 36 + 160 + 25 + 235 + 100);
  const rows = reputationBreakdown(stats);
  assert.equal(rows.reduce((sum, r) => sum + r.value, 0), computeReputation(stats));
});
