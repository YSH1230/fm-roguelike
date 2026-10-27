// 개발 도구(8장): ?dev=1 로 열면 보인다. TUNE 슬라이더, 통계 표시, 시드 재생, 입력 기록 저장. 게임 규칙은 건드리지 않고 TUNE 값만 바꾼다.
import { TUNE } from './futsalRules.mjs';
import { controlState } from './futsalSim.mjs';

const GROUPS = ['input', 'kick', 'pass', 'shot', 'defense', 'tackle', 'move', 'stamina', 'ring', 'difficulty', 'ai'];
const LOG_KEY = 'fmFutsalInputLog';
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장소 없음 */ } } };

// 입력 기록: 매 프레임이 아니라 바뀔 때만 쌓는다. 경기 흐름이 바뀔 때와 페이지를 떠날 때 자동 저장한다.
export function createInputLog() {
  let log = []; let last = '';
  const save = (seed) => store.set(LOG_KEY, JSON.stringify({ seed, tune: TUNE, log }));
  return {
    reset() { log = []; last = ''; },
    push(t, polled) { const m = polled.move ? `${polled.move.x.toFixed(2)},${polled.move.y.toFixed(2)}` : ''; if (m !== last || polled.actions.length) { log.push({ t: +t.toFixed(3), move: polled.move, actions: polled.actions }); last = m; } },
    save,
    get length() { return log.length; },
    text() { return store.get(LOG_KEY) ?? ''; },
  };
}

export function initDev({ getM, getSeed, restart, inputLog }) {
  if (!new URLSearchParams(location.search).has('dev')) return;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:0;top:0;bottom:0;width:260px;overflow:auto;background:rgba(6,11,22,.94);color:#cbd5e1;font:11px monospace;padding:6px;z-index:30;display:none';
  const stats = document.createElement('pre');
  stats.style.cssText = 'position:fixed;left:6px;bottom:6px;margin:0;color:#e2e8f0;background:rgba(6,11,22,.6);font:10px monospace;padding:4px;z-index:30;pointer-events:none';
  const tog = document.createElement('button');
  tog.textContent = 'DEV'; tog.style.cssText = 'position:fixed;right:4px;bottom:4px;z-index:31;font:10px monospace;padding:4px 6px';
  document.body.append(box, stats, tog);
  tog.onclick = () => { box.style.display = box.style.display === 'none' ? 'block' : 'none'; };
  const seedRow = document.createElement('div');
  seedRow.innerHTML = '<b>seed</b> <input id="dv-seed" type="number" style="width:70px"> <button id="dv-go">replay</button> <button id="dv-log">log</button> <span id="dv-n"></span>';
  box.append(seedRow);
  seedRow.querySelector('#dv-go').onclick = () => restart(Number(seedRow.querySelector('#dv-seed').value) || getSeed());
  seedRow.querySelector('#dv-log').onclick = () => { inputLog.save(getSeed()); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([inputLog.text()], { type: 'application/json' })); a.download = `futsal-input-${getSeed()}.json`; a.click(); };
  for (const g of GROUPS) {
    const d = document.createElement('details'); const sm = document.createElement('summary'); sm.textContent = g; d.append(sm);
    for (const [k, v] of Object.entries(TUNE[g] ?? {})) {
      if (typeof v !== 'number') continue;
      const row = document.createElement('div'); const lab = document.createElement('span'); lab.textContent = `${k} `;
      const out = document.createElement('span'); out.textContent = v;
      const r = document.createElement('input'); r.type = 'range'; const lo = v >= 0 ? 0 : v * 3; const hi = v === 0 ? 1 : Math.abs(v) * 3; r.min = lo; r.max = hi; r.step = hi / 200; r.value = v; r.style.width = '100%';
      r.oninput = () => { TUNE[g][k] = Number(r.value); out.textContent = (+r.value).toFixed(3); };
      row.append(lab, out, r); d.append(row);
    }
    box.append(d);
  }
  setInterval(() => {
    const M = getM(); if (!M) return; const S = M.stats; seedRow.querySelector('#dv-n').textContent = `${inputLog.length} ev`; const q = (a) => a.join('/');
    const me = M.players[M.control]; const st = controlState(M);
    stats.textContent = `조종 #${me?.num ?? '-'} ${me?.id ?? ''} 상태 ${st.length ? st.join(',') : '자유'}\n` + `seed ${getSeed()}  score ${q(M.score)}\nshots ${q(S.shots)} passes ${q(S.passes)} ok ${q(S.passOk)}\nicpt ${q(S.intercepts)} tackles ${q(S.tackles)} saves ${q(S.saves)}`;
  }, 250);
}
