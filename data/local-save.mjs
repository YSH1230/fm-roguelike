import { generateStaffOffer } from './staff.mjs';

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

// 이 브랜치 이전 세이브에는 highestTierId/titles/missedTargetCount/seasonNumber가
// 없다. 없는 채로 이어하면 computeReputation이 던지고(화면이 안 넘어가 런이 멎음)
// nextMissedTargetCount가 NaN이 되어(해임 판정이 영구히 안 걸림) 런이 망가진다.
// DOM 없이 테스트할 수 있게 순수 함수로 빼둔다.
export function withRunDefaults(state, defaultFormation) {
  if (!state) return state;
  state.formation ??= defaultFormation;
  state.highestTierId ??= state.leagueTierId;
  state.titles ??= 0;
  state.missedTargetCount ??= 0;
  state.seasonNumber ??= 1;
  state.manualOverrides ??= {};
  state.benchOverrides ??= {};
  state.boardDemand ??= null;
  state.seasonTrack ??= { spent: 0, winterTransactions: 0 };
  state.uclTitles ??= 0;
  state.managerOffer ??= []; // 다음 '다음 주로'에서 다시 채워진다
  state.staffOffer ??= generateStaffOffer(); // 구버전 세이브는 스태프 후보 이름/얼굴이 없다
  if (state.staff) {
    for (const role of ['headCoach', 'headScout']) {
      state.staff[role].name ??= '무명';
    }
  }
  state.eventTone ??= null; // 구버전 세이브는 이벤트 팝업 정보가 없다 - 안 띄운다
  state.expectationModifier ??= 0; // 구버전 세이브는 이사진 기대치 가감이 없다 - 중립
  // 계약 시스템 이전 세이브는 선수마다 contractYearsLeft가 없다. 없는 채로
  // 두면 (undefined ?? 2)는 매번 2로 취급되지만, 명시적으로 채워서 다음
  // startNewSeason의 -1 계산이 NaN이 되는 일을 막는다.
  if (state.squad) {
    state.squad = state.squad.map((p) => ({ ...p, contractYearsLeft: p.contractYearsLeft ?? 2 }));
  }
  return state;
}
