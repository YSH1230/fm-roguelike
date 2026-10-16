import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../engine/game.mjs';
import { teamIdentity } from '../engine/names.mjs';
import { conditionTexts, effectChips, esc, starsHtml } from '../ui/components.mjs';
import { startDraftScreen } from '../ui/screens.mjs';

const freshUi = (extra = {}) => ({ view: 'hub', tab: 'roster', rest: new Set(), tips: new Set(), flash: null, candidates: {}, last: null, ...extra });

test('팀 이름은 200팀이 모두 다르고 같은 id는 늘 같은 이름이다', () => {
  const names = new Set();
  for (let r = 0; r < 8; r += 1) for (let t = 1; t <= (r === 0 ? 3 : 1); t += 1) for (let i = 0; i < 20; i += 1) {
    const id = `R${r}T${t}-${String(i).padStart(2, '0')}`;
    names.add(teamIdentity(id).name);
    assert.equal(teamIdentity(id).name, teamIdentity(id).name);
  }
  assert.equal(names.size, 200);
});

test('문자 이스케이프: 구단 이름에 태그가 들어가도 그대로 글자로만 나온다', () => {
  assert.equal(esc('<img src=x onerror=1>"\''), '&lt;img src=x onerror=1&gt;&quot;&#39;');
  const g = createGame({ seed: 1, clubName: '<b>해킹</b>' });
  const html = startDraftScreen(g, freshUi());
  assert.ok(!html.includes('<b>해킹</b>'));
  assert.ok(html.includes('&lt;b&gt;해킹&lt;/b&gt;'));
});

test('별 표시는 0.5 단위 비율이 그대로 들어간다', () => {
  assert.ok(starsHtml(2.5).includes('--v:50%'));
  assert.ok(starsHtml(5).includes('--v:100%'));
});

test('효과 칩과 영입 조건 문구', () => {
  const chips = effectChips({ teamMood: 3, fans: -1, coins: -10, rest: true });
  for (const t of ['팀 사기 +3', '팬 -1', '코인 -10', '다음 구간 휴식']) assert.ok(chips.includes(t), t);
  assert.deepEqual(conditionTexts({ maxRank: 5, minFacility: 3, minFans: 20, minMorale: 60 }), ['작년 5위 이상', '시설 3 이상', '팬 20 이상', '팀 사기 60 이상']);
  assert.deepEqual(conditionTexts({}), []);
});
