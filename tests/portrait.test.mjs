import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPortrait } from '../ui/portrait.mjs';

const CONTINENTS = ['africa', 'southAmerica', 'asiaOceania', 'europe', 'northCentralAmerica'];

// 해시에서 값을 뽑을 때 부호 있는 >> 를 쓰면 seed가 2^31을 넘는 순간 음수가 되고
// list[음수] === undefined 라서 fill="undefined"인 도형이 나온다(화면에선 까만 덩어리).
test('생성된 초상화에 undefined 색이 섞이지 않는다', () => {
  for (let i = 0; i < 500; i++) {
    const svg = renderPortrait({
      id: `p${i}`, name: '테스트', age: 18 + (i % 18), continentTag: CONTINENTS[i % 5],
    });
    assert.ok(!svg.includes('undefined'), `p${i} 초상화에 undefined가 있다`);
    assert.ok(!svg.includes('fill=""'), `p${i} 초상화에 빈 fill이 있다`);
  }
});

test('같은 선수는 항상 같은 얼굴이 나온다', () => {
  const card = { id: 'p0042', name: '테스트', age: 27, continentTag: 'europe' };
  assert.equal(renderPortrait(card), renderPortrait(card));
});
