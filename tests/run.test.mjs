import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeRunOutcome, nextMissedTargetCount, computeReputation, reputationBreakdown, seasonPrestige, demandPrestige, uclPrestige, retirePrestige, gradeOf, titleProgress } from '../engine/run.mjs';
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

test('명성 점수: 리그가 높고 결과가 좋을수록 크다', () => {
  const champ5 = seasonPrestige({ tierId: 'tier5', result: 'champion', points: 60, safePoints: 43 });
  assert.equal(champ5.rows.find((r) => r.id === 'league').value, 50);
  assert.equal(champ5.rows.find((r) => r.id === 'surplus').value, Math.round(17 * 0.5));
  const champ1 = seasonPrestige({ tierId: 'tier1', result: 'champion', points: 0, safePoints: 0 });
  assert.equal(champ1.total, 400);
  const safe = seasonPrestige({ tierId: 'tier3', result: 'safe', points: 50, safePoints: 50 });
  assert.equal(safe.total, 35);
  assert.equal(seasonPrestige({ tierId: 'tier3', result: 'relegation', points: 10, safePoints: 50 }).total, 0);
});

test('명성 점수: 연속 승격·우승 콤보와 우승 연속 보너스', () => {
  const s1 = seasonPrestige({ tierId: 'tier5', result: 'promotion', combo: 0 });
  assert.equal(s1.combo, 1);
  assert.ok(!s1.rows.some((r) => r.id === 'combo'));
  const s2 = seasonPrestige({ tierId: 'tier4', result: 'promotion', combo: s1.combo });
  assert.equal(s2.combo, 2);
  assert.equal(s2.rows.find((r) => r.id === 'combo').value, 10);
  const s9 = seasonPrestige({ tierId: 'tier1', result: 'champion', combo: 8, titleStreak: 1 });
  assert.equal(s9.rows.find((r) => r.id === 'combo').value, 60); // 최대 60
  assert.equal(s9.rows.find((r) => r.id === 'streak').value, 30);
  assert.equal(seasonPrestige({ tierId: 'tier4', result: 'safe', combo: 3, titleStreak: 2 }).combo, 0); // 잔류하면 콤보가 끊긴다
});

test('명성 점수: 이사진 요구·챔피언스리그·더블·은퇴', () => {
  assert.equal(demandPrestige('hard')[0].value, 15);
  assert.deepEqual(demandPrestige('none'), []);
  assert.equal(uclPrestige('final')[0].value, 180);
  assert.equal(uclPrestige('champion', { alsoLeagueChampion: true }).reduce((s, r) => s + r.value, 0), 300 + 150);
  assert.equal(uclPrestige('champion').reduce((s, r) => s + r.value, 0), 300);
  assert.equal(retirePrestige()[0].value, 200);
});

test('런 등급과 칭호 진행도', () => {
  assert.equal(gradeOf(0), 'D');
  assert.equal(gradeOf(179), 'D');
  assert.equal(gradeOf(180), 'C');
  assert.equal(gradeOf(449), 'C');
  assert.equal(gradeOf(450), 'B');
  assert.equal(gradeOf(799), 'B');
  assert.equal(gradeOf(800), 'A');
  assert.equal(gradeOf(1399), 'A');
  assert.equal(gradeOf(1400), 'S');
  assert.equal(gradeOf(6999), 'S');
  assert.equal(gradeOf(7000), 'SS');
  const t = titleProgress(0);
  assert.equal(t.title, '무명 감독');
  assert.equal(t.next, '동네 감독');
  assert.equal(t.remaining, 150);
  const m = titleProgress(275);
  assert.equal(m.title, '동네 감독');
  assert.equal(m.remaining, 125);
  assert.ok(Math.abs(m.progress - 0.5) < 1e-9);
  const top = titleProgress(99999);
  assert.equal(top.title, '전설의 감독');
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
});
