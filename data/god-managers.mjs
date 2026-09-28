// 스펙 5.2절: GOD 등급 감독은 전 세계 2명뿐 — 절차적 생성 대상 아님, 수작업 고정
export const GOD_MANAGERS = [
  {
    // 퍼거슨 모티브: 26년 한 클럽 장기 집권 + "헤어드라이어 트리트먼트"가 별명이었다.
    id: 'god-manager-01',
    name: 'Alex Fergusson',
    tier: 'god',
    multiplier: 1.20,
    tacticalTag: 'longBallKickAndRush',
    continentTag: 'europe',
    trait: 'hairdryer',
  },
  {
    id: 'god-manager-02',
    name: 'Pep Alonzo',
    tier: 'god',
    multiplier: 1.20,
    tacticalTag: 'tikiTaka',
    continentTag: 'southAmerica',
    trait: 'silverTongue',
  },
];
