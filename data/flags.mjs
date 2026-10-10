// 계정(브라우저) 단위로 남는 작은 상태: 튜토리얼 진행, 처음 만난 기능 안내. 런이 바뀌어도 유지된다.
// 해금 시스템은 폐지했다: 모든 기능(태그 6종·이사진·전술 방향·감독·스태프·특수 성향)이 처음부터 열려 있다.
const KEY = 'fm-roguelike-flags';

const blank = () => ({ tutorialStep: 0, tutorialDone: false, unlocked: {}, seen: {} });

export function loadFlags(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage.getItem(KEY));
    return { ...blank(), ...raw, unlocked: { ...(raw?.unlocked ?? {}) }, seen: { ...(raw?.seen ?? {}) } };
  } catch {
    return blank();
  }
}

export function updateFlags(fn, storage = globalThis.localStorage) {
  const next = fn(loadFlags(storage)) ?? loadFlags(storage);
  try { storage.setItem(KEY, JSON.stringify(next)); } catch { /* 저장이 막혀도 게임은 계속 */ }
  return next;
}

// 새 기능을 처음 마주쳤을 때 한 줄로 알려 준 적이 있는지(한 번만 보여 준다).
export const markSeen = (key, storage) => updateFlags((f) => { f.seen[key] = true; return f; }, storage);
// 예전 코드가 부르던 이름 - 이제 항상 열려 있다.
export const isUnlocked = () => true;
