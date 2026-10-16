import { NAME_POOLS, randomName } from '../data/name-pools.mjs';
import { createRng } from './rng.mjs';

const CONTINENTS = Object.keys(NAME_POOLS);

function hashOf(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// 선수 id만으로 정해지는 대륙(초상화 피부색과 이름 풀이 함께 따라간다)
export const continentOf = (id) => CONTINENTS[hashOf(id) % CONTINENTS.length];

// 내가 바꾼 이름(선수 id -> 이름). 게임이 저장할 때 함께 저장되고, 불러올 때 다시 등록한다.
let customNames = {};
export const setCustomNames = (map) => { customNames = map ?? {}; };

// 선수 id만으로 정해지는 기본 이름 위에 내가 바꾼 이름을 덮어쓴다.
export function nameOf(id) {
  if (customNames[id]) return customNames[id];
  const rng = createRng(hashOf(id));
  rng(); // 대륙 고르는 데 쓴 첫 값은 건너뛰어 이름과 대륙이 따로 놀지 않게 한다
  return randomName(continentOf(id), rng);
}

const PLACES = ['북항', '새벽', '은하', '청송', '해오름', '달빛', '한울', '푸른', '백야', '돌고래', '불꽃', '철새', '마루', '여울', '노을', '솔빛', '파도', '구름', '황금', '바람',
  '눈꽃', '샛별', '갯벌', '모래', '소나무', '호랑이', '매화', '단풍', '안개', '번개', '폭풍', '별무리', '산마루', '강나루', '들불', '하늘', '가람', '아침', '한라', '금강'];
const SUFFIXES = ['FC', 'United', 'Athletic', 'City', 'Rovers', 'Town', 'Wanderers', 'Albion', 'Rangers', 'Dynamos', 'Stars', 'Sporting'];

// AI 팀 id(R지역T단계-번호)에서 0~479 순번을 뽑는다. 장소 40 x 접미사 12 = 480이라 이름이 겹치지 않는다.
function teamIndex(id) {
  const m = /^R(\d+)T(\d)-(\d+)$/.exec(id);
  return m ? Number(m[1]) * 60 + (Number(m[2]) - 1) * 20 + Number(m[3]) : hashOf(id) % 480;
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// 팀 id만으로 정해지는 팀 이름과 유니폼 색. 내 팀(ME)은 game.clubName을 따로 쓴다.
export function teamIdentity(id) {
  const g = teamIndex(id);
  const hue = Math.round((g * 137.5) % 360);
  const a = g % PLACES.length;
  const b = (Math.floor(g / PLACES.length) + a) % SUFFIXES.length; // 장소가 같으면 접미사가 다르고, 이웃한 팀은 접미사도 달라진다
  return { name: `${PLACES[a]} ${SUFFIXES[b]}`, kit: hslToHex(hue, 0.55, 0.38), hue };
}
