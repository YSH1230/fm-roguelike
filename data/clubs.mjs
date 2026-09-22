// 스펙 4절 "슬라이스 구단 4종" — 강점 1개 + 약점 1개, 고정 데이터 (4개뿐이라 생성기 불필요)
export const CLUBS = [
  {
    id: 'club-youth-academy',
    name: '유스 명문',
    strength: '시작 선수단에 성골 유스 다수',
    weakness: '시작 자금 적음',
    startingFundsMultiplier: 0.8,
  },
  {
    id: 'club-oil-money',
    name: '오일머니',
    strength: '시작 자금 많음, 레전더리급 1명 보유',
    weakness: '이적 오퍼 성과 기대치 큼',
    startingFundsMultiplier: 1.5,
  },
  {
    id: 'club-defensive-tradition',
    name: '수비 전통',
    strength: '수비형 플레이스타일 편중, 적응도 시작 높음',
    weakness: '공격 태그 카드 등장률 낮음',
    startingFundsMultiplier: 1.0,
  },
  {
    id: 'club-attacking-football',
    name: '공격 축구',
    strength: '공격형 플레이스타일 편중',
    weakness: '수비 포지션 OVR 낮음',
    startingFundsMultiplier: 1.0,
  },
];
