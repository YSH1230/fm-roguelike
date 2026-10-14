import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportFor, growthBand, reportAccuracy, centerErrorFactor, REPORT_ACC } from '../engine/report.mjs';
import { rollHiddenTraits } from '../engine/stars.mjs';

const LEVELS = ['academy', 'proLicense', 'veteran', 'master'];
const mk = (i, extra = {}) => ({ id: `r${i}`, age: 20 + (i % 15), position: ['CMF', 'ST', 'CB', 'GK'][i % 4], baseOVR: 52 + (i % 20), ...rollHiddenTraits(), ...extra });
const CTX = { anchor: 59, lineup: [] };

test('같은 입력은 항상 같은 출력이고, 정확도 숫자는 반환하지 않는다', () => {
  const p = mk(7);
  for (const l of LEVELS) { assert.deepEqual(reportFor(p, l, CTX), reportFor(p, l, CTX)); assert.ok(!JSON.stringify(reportFor(p, l, CTX)).includes('acc')); }
});

test('항목 수: 항상 3 + 등급별 1/2/3/4', () => {
  const p = mk(3);
  assert.deepEqual(LEVELS.map((l) => { const r = reportFor(p, l, CTX); return [r.always.length, r.graded.length]; }), [[3, 1], [3, 2], [3, 3], [3, 4]]);
  assert.deepEqual(reportFor(p, 'master', CTX).graded.map((x) => x.id), ['position', 'name', 'durability', 'traits']);
});

test('코치 정확도: 보유 시즌마다 +0.04, 상한 0.80', () => {
  assert.equal(reportAccuracy('academy', 3, 'scout'), 0.55);
  assert.ok(Math.abs(reportAccuracy('academy', 3, 'coach') - 0.67) < 1e-9);
  for (const l of LEVELS) assert.ok(reportAccuracy(l, 20, 'coach') <= 0.8 && reportAccuracy(l, 0, 'scout') <= 0.8);
  assert.ok(Math.abs(centerErrorFactor(0.55) - 1.37) < 0.03 && Math.abs(centerErrorFactor(0.68) - 0.81) < 0.03 && Math.abs(centerErrorFactor(0.78) - 0.3) < 0.03 && centerErrorFactor(0.8) === 0);
});

test('성장폭이 참값을 포함하는 비율: 등급별 .55/.68/.78/.80(±.03)', () => {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  for (const l of LEVELS) {
    let hit = 0; const n = 12000;
    for (let i = 0; i < n; i++) {
      const b = growthBand(mk(i), l, { anchor: 59 });
      const truth = b.trueCenter + b.W * gauss();
      if (truth >= b.lo && truth <= b.hi) hit++;
    }
    assert.ok(Math.abs(hit / n - REPORT_ACC[l]) < 0.03, `${l} ${hit / n}`);
  }
});

test('범주형 항목 정답률(내구성): 마스터 .80±.03', () => {
  let ok = 0; const n = 10000;
  for (let i = 0; i < n; i++) {
    const p = mk(i, { durability: ['iron', 'normal', 'fragile'][i % 3] });
    if (reportFor(p, 'master', CTX).graded[2].text === { iron: '철인', normal: '보통', fragile: '유리몸' }[p.durability]) ok++;
  }
  assert.ok(Math.abs(ok / n - 0.8) < 0.03, `${ok / n}`);
});

test('작년 흐름·부상 이력은 사실이다(등급과 무관)', () => {
  const p = { ...mk(1), volatility: 'normal', prevForm: 2.5 * 0.9, injHistory: [{ kind: 'season', ago: 1, part: 'acl' }] };
  for (const l of LEVELS) { const r = reportFor(p, l, CTX).always; assert.equal(r[1].text, '호조'); assert.equal(r[2].text, '지난 시즌 시즌 아웃'); assert.deepEqual(r[2].expanded, ['십자인대 파열']); }
  assert.equal(reportFor({ ...p, prevForm: -2.5 }, 'academy', CTX).always[1].text, '부진');
  assert.equal(reportFor({ ...p, prevForm: 0 }, 'academy', CTX).always[1].text, '보통');
  assert.equal(reportFor({ ...p, prevForm: undefined }, 'academy', CTX).always[1].text, '보통'); // 옛 세이브
});

test('자리 판단: 같은 자리가 공석이면 즉시 전력(마스터는 정확)', () => {
  let ok = 0;
  for (let i = 0; i < 200; i++) if (reportFor(mk(i), 'master', { anchor: 59, lineup: [] }).graded[0].text === '즉시 전력') ok++;
  assert.ok(ok / 200 > 0.7);
});
