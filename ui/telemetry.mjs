// 플레이 통계 자동 수집(선택). 구글 폼에 "응답 1건"으로 JSON 한 줄을 보낸다.
// 이름·이메일 같은 개인정보는 보내지 않는다. 기기에 저장된 무작위 번호 하나와 게임 기록만 보낸다.
// FORM_ACTION과 FIELD가 비어 있으면 아무것도 보내지 않는다(꺼진 상태).
//   FORM_ACTION: 구글 폼 응답 주소  https://docs.google.com/forms/d/e/<폼ID>/formResponse
//   FIELD:       질문 칸 이름        entry.1234567890
const FORM_ACTION = 'https://docs.google.com/forms/d/e/1FAIpQLSdaEoTGPwhzsGlFBxPnVTCVoCnoFOeWmwJ7aj1xspDadP9LLQ/formResponse';
const FIELD = 'entry.1507070525';
const BUILD = '2026-10-09';

const ID_KEY = 'fm-roguelike-anon';
const OFF_KEY = 'fm-roguelike-telemetry-off';

export const telemetryConfigured = () => Boolean(FORM_ACTION && FIELD);

export function telemetryOn() {
  try { return telemetryConfigured() && localStorage.getItem(OFF_KEY) !== '1'; } catch { return false; }
}
export function setTelemetry(on) {
  try { if (on) localStorage.removeItem(OFF_KEY); else localStorage.setItem(OFF_KEY, '1'); } catch { /* 저장이 막혀도 게임은 계속 */ }
}

function anonId() {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem(ID_KEY, id); }
    return id;
  } catch { return 'noid'; }
}

// 실패해도(오프라인·차단) 게임에는 아무 영향이 없게 조용히 넘어간다.
export function track(event, data = {}) {
  if (!telemetryOn()) return;
  try {
    const body = new URLSearchParams({ [FIELD]: JSON.stringify({ e: event, id: anonId(), v: BUILD, t: Date.now(), ...data }) });
    fetch(FORM_ACTION, { method: 'POST', mode: 'no-cors', body, keepalive: true }).catch(() => {});
  } catch { /* 무시 */ }
}
