import { renderPortrait } from './portrait.mjs';

// 튜토리얼 진행자: 구단 사무국 신입 직원 올리비아(고정 인물, 밝고 명랑한 성격)
const GUIDE = { id: 'guide-olivia', name: '올리비아 하트', continentTag: 'europe', age: 23 };

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

// 문구는 첫 문장이 굵은 핵심(행동 지시), 나머지는 보조 줄로 나뉜다. ok가 있으면 큰 "확인" 버튼(설명 단계),
// 없으면 대상 자체를 눌러야 다음으로 간다(행동 단계: 맥박 링 + "여기를 눌러요" 꼬리표). progress=[지금, 전체]면 단계 점이 붙는다.
const splitText = (text) => {
  const m = text.match(/^(.+?[.!?])\s+(.+)$/s);
  return m ? [m[1], m[2]] : [text, ''];
};
// inModal: 대상이 위에 열린 창(협상 등) 안에 있을 때 true - 창이 열려 있어도 안내를 숨기지 않는다.
export function showSpot({ selector, text, ok = null, onOk = null, onSkip = null, progress = null, inModal = false }) {
  clearSpot();
  const target = document.querySelector(selector);
  if (!target) return false;
  target.scrollIntoView({ block: 'center' });
  const [head, sub] = splitText(text);
  const el = document.createElement('div');
  el.className = `tut ${ok ? 'tut--info' : 'tut--act'}`;
  const dots = progress ? `<div class="tut__dots" aria-label="${progress[0]}/${progress[1]}">${Array.from({ length: progress[1] }, (_, i) => `<i class="${i < progress[0] ? 'on' : ''}"></i>`).join('')}</div>` : '<div class="tut__dots"></div>';
  el.innerHTML = `<i class="tut__dim" data-p="t"></i><i class="tut__dim" data-p="b"></i><i class="tut__dim" data-p="l"></i><i class="tut__dim" data-p="r"></i><i class="tut__ring"></i>
    ${ok ? '' : '<span class="tut__point">여기를 눌러요<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v14M6 12l6 6 6-6"/></svg></span>'}
    <div class="tut__tip" role="dialog" aria-live="polite"><div class="tut__top">${dots}<button class="tut__skip" type="button">건너뛰기</button></div>
      <div class="tut__who"><div class="tut__av">${renderPortrait(GUIDE, { size: 52, role: 'guide' })}</div><div class="tut__body"><b class="tut__head"></b><p class="tut__text"></p></div></div><div class="tut__btns"></div></div>`;
  el.querySelector('.tut__head').textContent = head;
  const subEl = el.querySelector('.tut__text');
  if (sub) subEl.textContent = sub; else subEl.remove();
  const btns = el.querySelector('.tut__btns');
  if (ok) {
    const b = document.createElement('button');
    b.className = 'tut__ok';
    b.textContent = ok;
    b.onclick = () => { clearSpot(); onOk?.(); };
    btns.append(b);
  } else btns.remove();
  el.querySelector('.tut__skip').onclick = () => { clearSpot(); onSkip?.(); };
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
    const below = top <= vh / 2; // 대상이 위쪽이면 시트는 아래, 아래쪽이면 위(대상을 가리지 않는다)
    tip.style.top = below ? '' : '10px'; tip.style.bottom = below ? '10px' : '';
    const pt = el.querySelector('.tut__point');
    if (pt) { pt.style.right = '24px'; pt.style.left = ''; if (below) { pt.style.bottom = ''; pt.style.top = `${Math.max(6, top - 34)}px`; } else { pt.style.top = ''; pt.style.bottom = `${vh - top + 6}px`; } }
  };
  const loop = () => {
    if (!state) return;
    if (!document.body.contains(target)) { clearSpot(); return; }
    // 협상 같은 창이 위에 열려 있는 동안은 안내를 숨긴다(안 그러면 창을 가려서 누를 수 없다)
    const covered = !inModal && !!document.querySelector('#eventmodal-root .eventmodal');
    el.style.display = covered ? 'none' : '';
    if (!covered) place();
    state.raf = requestAnimationFrame(loop);
  };
  state = { el, raf: 0 };
  place();
  state.raf = requestAnimationFrame(loop);
  return true;
}
