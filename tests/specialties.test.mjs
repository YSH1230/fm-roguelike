import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHILOSOPHIES, PHILOSOPHY_IDS, MAX_PHILOSOPHY_LEVEL, drawPhilosophyChoices, levelUpPhilosophy, philosophyText,
  TALKS, TALK_IDS, drawTalkChoices, rollTalkOutcome, describeTalkFx, specialtyEffects,
} from '../engine/specialties.mjs';
import { TAG_IDS } from '../engine/constants.mjs';
import { ageSquad } from '../engine/aging.mjs';

test('전술 철학은 8종이고 모두 Lv1~Lv5 효과가 있으며 점점 강해진다', () => {
  assert.equal(PHILOSOPHY_IDS.length, 8);
  for (const id of PHILOSOPHY_IDS) {
    const p = PHILOSOPHIES[id];
    assert.equal(p.levels.length, MAX_PHILOSOPHY_LEVEL, id);
    const val = (e) => Object.values(e.tagBonus ?? {})[0] ?? e.formationBonus ?? e.defenseLine;
    for (let i = 1; i < p.levels.length; i++) assert.ok(val(p.levels[i]) > val(p.levels[i - 1]), `${id} Lv${i + 1}`);
    assert.ok(p.name && p.blurb && p.line, id);
    assert.ok(philosophyText(id, 3).length > 5);
  }
  // 태그 철학 6종은 태그 6종과 하나씩 짝이다
  const tags = PHILOSOPHY_IDS.map((id) => PHILOSOPHIES[id].tag).filter(Boolean).sort();
  assert.deepEqual(tags, [...TAG_IDS].sort());
});

test('철학 3택1은 서로 다른 3장이다', () => {
  for (let i = 0; i < 100; i++) {
    const c = drawPhilosophyChoices();
    assert.equal(c.length, 3);
    assert.equal(new Set(c).size, 3);
  }
});

test('승격마다 한 단계씩 강해지고 Lv5에서 멈춘다(승격 4번이면 Lv5)', () => {
  let ph = { id: 'pressing', level: 1 };
  for (let i = 0; i < 4; i++) ph = levelUpPhilosophy(ph);
  assert.equal(ph.level, 5);
  assert.equal(levelUpPhilosophy(ph).level, 5);
  assert.equal(levelUpPhilosophy(null), null);
});

test('철학 효과: 태그 철학은 그 태그만, 토탈 축구는 포메이션 궁합, 철벽 수비는 수비 라인', () => {
  const press = specialtyEffects({ id: 'pressing', level: 2 });
  assert.equal(press.tagBonus.press, 2.5);
  assert.equal(press.formationBonus, 0);
  assert.equal(specialtyEffects({ id: 'totalFootball', level: 5 }).formationBonus, 6);
  assert.equal(specialtyEffects({ id: 'catenaccio', level: 3 }).defenseLine, 2);
  const none = specialtyEffects(null);
  assert.deepEqual(none.tagBonus, {});
  assert.equal(none.buyDiscount, 0);
  assert.equal(none.saleMult, 1);
});

test('라커룸 토크: 시작 8종, 종료 6종이고 3장씩 뽑는다', () => {
  assert.equal(TALK_IDS.start.length, 8);
  assert.equal(TALK_IDS.end.length, 6);
  for (const kind of ['start', 'end']) {
    const c = drawTalkChoices(kind);
    assert.equal(c.length, 3);
    assert.equal(new Set(c).size, 3);
  }
});

test('모든 토크 반응에는 장점과 단점이 같이 있고, 한 토크마다 반응이 3가지다', () => {
  for (const kind of ['start', 'end']) {
    for (const [id, t] of Object.entries(TALKS[kind])) {
      assert.equal(t.outcomes.length, 3, `${kind}:${id}`);
      assert.ok(t.name && t.line && ['safe', 'risky'].includes(t.tone), `${kind}:${id}`);
      for (const o of t.outcomes) {
        const d = describeTalkFx(o.fx);
        assert.ok(d.some((x) => x.good) && d.some((x) => !x.good), `${kind}:${id} - ${o.text}`);
        assert.ok(o.text.length > 5);
      }
    }
  }
});

test('토크를 고르면 반응 하나가 정해지고, 같은 토크도 반응이 달라질 수 있다', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(rollTalkOutcome('start', 'roar').text);
  assert.equal(seen.size, 3);
  const o = rollTalkOutcome('end', 'thanks', () => 0);
  assert.equal(o.name, '감사 연설');
  assert.ok(o.fx.nextStartChem > 0);
});

test('토크 효과를 철학 효과와 합친다(곱·합 구분)', () => {
  const fx = specialtyEffects({ id: 'totalFootball', level: 1 }, { formationBonus: 1, txDecayMult: 2, buyDiscount: 0.06, saleMult: 0.94, pointsFirst: -2, pointsSecond: 3, patienceBonus: 1 });
  assert.equal(fx.formationBonus, 3);
  assert.equal(fx.txDecayMult, 2);
  assert.equal(fx.buyDiscount, 0.06);
  assert.ok(Math.abs(fx.saleMult - 0.94) < 1e-9);
  assert.equal(fx.pointsFirst, -2);
  assert.equal(fx.pointsSecond, 3);
});

test('나이 먹기: 베테랑 하락 완화(+1)는 하락을 줄이고 악화(−1)는 키운다', () => {
  const at = () => ({ id: 'v', name: 'V', age: 34, baseOVR: 70, position: 'CMF', peakOVR: 70, peakBodyAge: 27 });
  const mean = (opts) => { let s = 0; const n = 600; for (let i = 0; i < n; i++) { const o = ageSquad([at()], Math.random, 'academy', opts).squad[0]; s += o ? o.baseOVR - 70 : -5; } return s / n; };
  assert.ok(mean({ vetRelief: 1 }) > mean({}));
  assert.ok(mean({ vetRelief: -1 }) < mean({}));
});

test('나이 먹기: 성장 추가 확률은 성장을 올리고, 음수면 성장을 깎는다', () => {
  const young = () => ({ id: 'y', name: 'Y', age: 19, baseOVR: 55, position: 'CMF', peakOVR: 75, peakBodyAge: 27 });
  const mean = (opts) => { let s = 0; const n = 800; for (let i = 0; i < n; i++) s += ageSquad([young()], Math.random, 'academy', opts).squad[0].baseOVR - 55; return s / n; };
  assert.ok(mean({ extraGrowth: 0.5 }) > mean({}) + 0.2);
  assert.ok(mean({ extraGrowth: -0.4 }) < mean({}) - 0.15);
});
