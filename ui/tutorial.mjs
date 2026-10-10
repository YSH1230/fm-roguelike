// 튜토리얼 스포트라이트: 화면을 어둡게 하고 눌러야 할 곳만 밝힌다.
// 어두운 부분은 클릭을 막고, 밝은 구멍은 그대로 통과해서 실제 버튼이 눌린다.
// 대상이 사라지면(화면이 다시 그려지면) 스스로 닫히고, 호출한 쪽이 다음 그리기에서 다시 띄운다.
let state = null;

export function clearSpot() {
  if (!state) return;
  cancelAnimationFrame(state.raf);
  state.el.remove();
  state = null;
}

// text: 한 줄 안내. ok가 있으면 "확인" 버튼이 붙고(누를 곳이 없는 단계), 없으면 대상 자체를 눌러야 다음으로 간다.
export function showSpot({ selector, text, ok = null, onOk = null, onSkip = null }) {
  clearSpot();
  const target = document.querySelector(selector);
  if (!target) return false;
  target.scrollIntoView({ block: 'center' });
  const el = document.createElement('div');
  el.className = 'tut';
  el.innerHTML = `<i class="tut__dim" data-p="t"></i><i class="tut__dim" data-p="b"></i><i class="tut__dim" data-p="l"></i><i class="tut__dim" data-p="r"></i><i class="tut__ring"></i>
    <div class="tut__tip" role="dialog" aria-live="polite"><p class="tut__text"></p><div class="tut__btns"></div></div>`;
  el.querySelector('.tut__text').textContent = text;
  const btns = el.querySelector('.tut__btns');
  if (ok) {
    const b = document.createElement('button');
    b.className = 'tut__ok';
    b.textContent = ok;
    b.onclick = () => { clearSpot(); onOk?.(); };
    btns.append(b);
  }
  const skip = document.createElement('button');
  skip.className = 'tut__skip';
  skip.textContent = '건너뛰기';
  skip.onclick = () => { clearSpot(); onSkip?.(); };
  btns.append(skip);
  document.body.append(el);

  const pad = 6;
  const place = () => {
    const r = target.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const top = Math.max(0, r.top - pad); const bottom = Math.min(vh, r.bottom + pad);
    const left = Math.max(0, r.left - pad); const right = Math.min(vw, r.right + pad);
    const set = (p, css) => Object.assign(el.querySelector(`[data-p="${p}"]`).style, css);
    set('t', { left: 0, top: 0, width: '100%', height: `${top}px` });
    set('b', { left: 0, top: `${bottom}px`, width: '100%', height: `${Math.max(0, vh - bottom)}px` });
    set('l', { left: 0, top: `${top}px`, width: `${left}px`, height: `${bottom - top}px` });
    set('r', { left: `${right}px`, top: `${top}px`, width: `${Math.max(0, vw - right)}px`, height: `${bottom - top}px` });
    Object.assign(el.querySelector('.tut__ring').style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
    const tip = el.querySelector('.tut__tip');
    if (top > vh / 2) { tip.style.top = ''; tip.style.bottom = `${vh - top + 12}px`; } else { tip.style.bottom = ''; tip.style.top = `${bottom + 12}px`; }
  };
  const loop = () => {
    if (!state) return;
    if (!document.body.contains(target)) { clearSpot(); return; }
    place();
    state.raf = requestAnimationFrame(loop);
  };
  state = { el, raf: 0 };
  place();
  state.raf = requestAnimationFrame(loop);
  return true;
}
