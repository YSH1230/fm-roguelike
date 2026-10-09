// 계정(브라우저) 단위로 남는 작은 상태: 튜토리얼 진행, 해금된 기능. 런이 바뀌어도 유지된다.
// 해금은 한 번 열리면 계속 열려 있다(런마다 다시 잠기지 않는다).
const KEY = 'fm-roguelike-flags';

// 해금 기능 id와 열리는 시즌. 시즌 번호는 그 런의 seasonNumber.
export const UNLOCK_SEASON = {
  mid: 2, // 보통 태그
  board: 2, // 이사진 요구
  direction: 2, // 반기 전술 방향
  hard: 3, // 어려움 태그
  staff: 3, // 감독·스태프
  traits: 3, // 특수 성향 배지
};
export const UNLOCK_LABEL = {
  mid: '보통 태그', board: '이사진 요구', direction: '반기 전술 방향',
  hard: '어려움 태그', staff: '감독·스태프', traits: '특수 성향',
};

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
export const isUnlocked = (feature, flags = loadFlags()) => Boolean(flags.unlocked[feature]);

// 이 시즌에 도달해서 새로 열리는 기능 id 목록을 돌려주고 저장한다.
export function unlockForSeason(seasonNumber, storage = globalThis.localStorage) {
  const fresh = [];
  updateFlags((f) => {
    for (const [feature, season] of Object.entries(UNLOCK_SEASON)) {
      if (seasonNumber >= season && !f.unlocked[feature]) { f.unlocked[feature] = true; fresh.push(feature); }
    }
    return f;
  }, storage);
  return fresh;
}
