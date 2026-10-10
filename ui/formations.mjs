// 포메이션 6종(태그 6종과 하나씩 짝). slots는 pickBestXI가 채울 포지션 순서, coords는 피치 위 표시 좌표(%).
// 포메이션을 바꾸면 슬롯 구성이 바뀌고 → 플레이스타일/대륙 시너지 발동 조건(engine/ovr.mjs)이
// 바뀌어 팀 전력이 실제로 달라진다. 별도 보정 로직은 없다 — 엔진이 이미 라인업을 보고 계산한다.
export const FORMATIONS = {
  '4-3-3': {
    tag: 'dribble', // 어울리는 태그: 이 포메이션에서 그 태그를 가진 선발은 OVR +1(engine/constants.mjs FORMATION_TAG_BONUS)
    slots: ['GK', 'CB', 'CB', 'WB', 'WB', 'DMF', 'CMF', 'CMF', 'W', 'W', 'ST'],
    coords: [
      [50, 90], [37, 70], [63, 70], [11, 63], [89, 63],
      [50, 52], [27, 42], [73, 42], [15, 20], [85, 20],
      [50, 9],
    ],
  },
  '4-4-2': {
    tag: 'physical',
    slots: ['GK', 'CB', 'CB', 'WB', 'WB', 'CMF', 'CMF', 'W', 'W', 'ST', 'ST'],
    coords: [
      [50, 90], [37, 71], [63, 71], [11, 64], [89, 64],
      [37, 45], [63, 45], [12, 38], [88, 38], [35, 11],
      [65, 11],
    ],
  },
  '4-2-3-1': {
    tag: 'pass',
    slots: ['GK', 'CB', 'CB', 'WB', 'WB', 'DMF', 'DMF', 'AMF', 'W', 'W', 'ST'],
    coords: [
      [50, 90], [37, 71], [63, 71], [11, 64], [89, 64],
      [36, 50], [64, 50], [50, 31], [14, 26], [86, 26],
      [50, 9],
    ],
  },
  '3-4-2-1': {
    tag: 'buildup',
    slots: ['GK', 'CB', 'CB', 'CB', 'WB', 'WB', 'CMF', 'CMF', 'AMF', 'AMF', 'ST'],
    coords: [
      [50, 92], [26, 72], [50, 72], [74, 72], [10, 50],
      [90, 50], [38, 50], [62, 50], [32, 28], [68, 28],
      [50, 10],
    ],
  },
  '3-4-3': {
    tag: 'press',
    slots: ['GK', 'CB', 'CB', 'CB', 'WB', 'WB', 'CMF', 'CMF', 'W', 'W', 'ST'],
    coords: [
      [50, 92], [26, 71], [50, 71], [74, 71], [10, 52],
      [90, 52], [38, 48], [62, 48], [18, 22], [82, 22],
      [50, 10],
    ],
  },
  '5-3-2': {
    tag: 'counter',
    slots: ['GK', 'CB', 'CB', 'CB', 'WB', 'WB', 'DMF', 'CMF', 'CMF', 'ST', 'ST'],
    coords: [
      [50, 92], [26, 72], [50, 72], [74, 72], [9, 53],
      [91, 53], [50, 52], [28, 40], [72, 40], [38, 11],
      [62, 11],
    ],
  },
};

export const DEFAULT_FORMATION = '4-3-3';

// 포지션 → 전력 스트립 그룹. 스트립은 라인업만 보므로 벤치는 포함하지 않는다.
export const POSITION_GROUPS = [
  { id: 'GK', label: '골키퍼', positions: ['GK'] },
  { id: 'DF', label: '수비', positions: ['CB', 'WB'] },
  { id: 'MF', label: '중원', positions: ['DMF', 'CMF', 'AMF'] },
  { id: 'FW', label: '공격', positions: ['W', 'ST'] },
];
