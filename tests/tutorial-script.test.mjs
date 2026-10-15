import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTutorialState, TUTORIAL_STEPS, TUTORIAL_SQUAD, TUTORIAL_CARDS, tutorialSaleOffers } from '../ui/tutorial-script.mjs';

test('튜토리얼 상태는 난수·시간 없이 항상 같다(Math.random 호출 0회)', () => {
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random 호출'); };
  try {
    const a = JSON.stringify(buildTutorialState());
    const b = JSON.stringify(buildTutorialState());
    assert.equal(a, b);
    assert.deepEqual(tutorialSaleOffers(1), tutorialSaleOffers(1));
  } finally { Math.random = real; }
});

test('고정 선수단: 16명(선발 11 + 벤치 5), 고정 id, 성격 4종이 한 명씩, 판매 연습·☆ 연습 선수가 있다', () => {
  assert.equal(TUTORIAL_SQUAD.length, 16);
  assert.deepEqual(TUTORIAL_SQUAD.map((p) => p.id), Array.from({ length: 16 }, (_, i) => `t${String(i + 1).padStart(2, '0')}`));
  const types = new Set(TUTORIAL_SQUAD.map((p) => p.personality).filter(Boolean));
  assert.equal(types.size, 4);
  const t14 = TUTORIAL_SQUAD.find((p) => p.id === 't14');
  assert.ok(t14.position === 'ST' && t14.age === 31);
  assert.ok(TUTORIAL_SQUAD.some((p) => p.injHistory.length) && TUTORIAL_SQUAD.some((p) => p.specialTrait));
});

test('영입 카드 3장은 고정 id(tc1~tc3)이고, 오퍼 2건은 기한이 다르다', () => {
  assert.deepEqual(TUTORIAL_CARDS.map((c) => c.id), ['tc1', 'tc2', 'tc3']);
  assert.equal(TUTORIAL_CARDS[0].price, 40);
  const [a, b] = tutorialSaleOffers(1);
  assert.ok(a.expires > b.expires && b.expires === 1);
});

test('단계 표: 트리거가 있고 id가 겹치지 않으며 허용 셀렉터가 문자열이다', () => {
  assert.equal(new Set(TUTORIAL_STEPS.map((s) => s.id)).size, TUTORIAL_STEPS.length);
  for (const s of TUTORIAL_STEPS) {
    assert.ok(s.trigger && s.selector && s.text, s.id);
    for (const a of s.allow ?? []) assert.equal(typeof a, 'string');
  }
  assert.ok(TUTORIAL_STEPS.length <= 13);
});

test('시작 상태는 튜토리얼 표시가 있고 저장용 필드가 본 게임 상태와 겹치지 않는다', () => {
  const s = buildTutorialState();
  assert.equal(s.tutorial, true);
  assert.equal(s.squad.length, 16);
  assert.equal(s.shopOffer.length, 0);
  assert.equal(s.funds, 120);
  assert.equal(s.week, 1);
});
