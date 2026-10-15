import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TALKS, TALK_IDS, drawTalkChoices, rollTalkOutcome, capTalkDelta, talkDirection, TALK_SEASON_CHEM_CAP, TALK_SEASON_POINTS_CAP } from '../engine/specialties.mjs';
import { TALK_MOOD } from '../engine/personality.mjs';
import { runHalfSeason } from '../engine/season.mjs';

test('②③ 토크 풀: 7장, 반기별 효과만 쓰고 성격 분위기 태그가 모두 있다', () => {
  for (const [kind, key] of [['pre1', 'pointsFirst'], ['pre2', 'pointsSecond']]) {
    assert.equal(TALK_IDS[kind].length, 7);
    assert.equal(drawTalkChoices(kind).length, 3);
    for (const id of TALK_IDS[kind]) {
      assert.ok(TALK_MOOD[id], `${id} 분위기`);
      assert.ok(['risky', 'safe'].includes(TALKS[kind][id].tone));
      for (const o of TALKS[kind][id].outcomes) assert.ok(key in o.fx && 'chemNow' in o.fx && !('pointsFirst' in o.fx && 'pointsSecond' in o.fx));
    }
  }
  assert.equal(rollTalkOutcome('pre1', 'roar').kind, 'pre1');
});

test('장당 평균 승점 환산(조직력 1점≈0.35점)이 0에 가깝다(±0.3)', () => {
  for (const kind of ['pre1', 'pre2']) for (const id of TALK_IDS[kind]) {
    const os = TALKS[kind][id].outcomes;
    const avg = os.reduce((a, o) => a + o.fx.chemNow * 0.35 + (o.fx.pointsFirst ?? o.fx.pointsSecond), 0) / os.length;
    assert.ok(Math.abs(avg) <= 0.3 + 1e-9, `${kind}/${id} ${avg}`);
  }
});

test('시즌 합계 한도: 조직력 ±8, 승점 ±4로 잘린다', () => {
  assert.equal(TALK_SEASON_CHEM_CAP, 8);
  assert.equal(TALK_SEASON_POINTS_CAP, 4);
  assert.equal(capTalkDelta(6, 5, 8), 2);
  assert.equal(capTalkDelta(-6, -5, 8), -2);
  assert.equal(capTalkDelta(0, 3, 8), 3);
  assert.equal(capTalkDelta(3, 2, 4), 1);
  assert.equal(capTalkDelta(9, 1, 8), -1); // 이미 한도를 넘었다면 한도로 되돌린다
});

test('톤은 변동성으로 이어지고, risky 반기는 승점 분산이 safe보다 훨씬 크다', () => {
  assert.deepEqual(['risky', 'safe', 'x'].map(talkDirection), ['attack', 'defense', 'balance']);
  const lineup = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, position: 'CMF', baseOVR: 60, playstyleTags: [] }));
  const sd = (dir) => { const xs = Array.from({ length: 3000 }, () => runHalfSeason(lineup, [], 60, 'tier5', Math.random, null, dir)); const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length); };
  assert.ok(sd('attack') > sd('defense') * 2.5);
});

import { switchPhilosophy, PHILOSOPHY_IDS } from '../engine/specialties.mjs';
test('철학: 8종이고, 바꾸면 새 철학은 max(1, 현재 Lv−2)로 시작한다', () => {
  assert.equal(PHILOSOPHY_IDS.length, 8);
  assert.deepEqual(switchPhilosophy({ id: 'a', level: 5 }, 'b'), { id: 'b', level: 3 });
  assert.deepEqual(switchPhilosophy({ id: 'a', level: 2 }, 'b'), { id: 'b', level: 1 });
  assert.deepEqual(switchPhilosophy({ id: 'a', level: 1 }, 'b'), { id: 'b', level: 1 });
});
