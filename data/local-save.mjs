const KEY = 'fm-roguelike-save';

// storage를 주입받아 브라우저 localStorage와 테스트용 가짜 스토리지를 둘 다 지원한다.
// 프라이빗 브라우징 등에서 접근이 막혀도 게임이 멎지 않도록 전부 무시하고 넘어간다.
export function saveRun(state, storage) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장 실패는 무시 — 게임은 메모리 상태로 계속 진행된다
  }
}

export function loadRun(storage) {
  try {
    const raw = storage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearRun(storage) {
  try {
    storage.removeItem(KEY);
  } catch {
    // no-op
  }
}
