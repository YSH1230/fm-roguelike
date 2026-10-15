// 접근성 보강: 모달(.eventmodal)·컷신(.dlg)이 열리면 역할·포커스·키보드를 붙인다. 렌더 코드는 건드리지 않는다.
const FOCUSABLE = 'button:not([disabled]), [href], select, input, [tabindex]:not([tabindex="-1"])';
const CLOSERS = /^(취소|닫기|그만두기|건너뛰기)/;
let lastFocus = null;

function enhanceModal(modal) {
  if (modal.dataset.a11y) return;
  modal.dataset.a11y = '1';
  const title = modal.querySelector('.eventmodal__title, h2, h1');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  if (title) modal.setAttribute('aria-label', title.textContent.trim());
  modal.tabIndex = -1;
  lastFocus = document.activeElement instanceof HTMLElement && !modal.contains(document.activeElement) ? document.activeElement : lastFocus;
  (modal.querySelector(FOCUSABLE) ?? modal).focus({ preventScroll: true });
}

function enhanceDialogue(dlg) {
  if (dlg.dataset.a11y) return;
  dlg.dataset.a11y = '1';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-live', 'polite');
  dlg.tabIndex = 0;
  dlg.focus({ preventScroll: true });
}

// 모달 안에서 Tab 순환, Esc는 닫기·취소 성격의 버튼이 있을 때만, 컷신은 Enter/Space로 다음 줄
document.addEventListener('keydown', (e) => {
  const dlg = document.querySelector('.dlg');
  if (dlg && (e.key === 'Enter' || e.key === ' ') && document.activeElement === dlg) { e.preventDefault(); dlg.click(); return; }
  const modal = document.querySelector('#eventmodal-root .eventmodal');
  if (!modal) return;
  if (e.key === 'Tab') {
    const items = [...modal.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0]; const last = items[items.length - 1];
    if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  } else if (e.key === 'Escape') {
    const closer = [...modal.querySelectorAll('button')].find((b) => CLOSERS.test(b.textContent.trim()));
    if (closer) { e.preventDefault(); closer.click(); }
  }
});

new MutationObserver(() => {
  const modal = document.querySelector('#eventmodal-root .eventmodal');
  if (modal) enhanceModal(modal);
  else if (lastFocus && document.contains(lastFocus) && !document.querySelector('.dlg')) { lastFocus.focus({ preventScroll: true }); lastFocus = null; }
  const dlg = document.querySelector('.dlg');
  if (dlg) enhanceDialogue(dlg);
}).observe(document.body, { childList: true, subtree: true });
