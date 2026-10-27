# 풋살 플레이 기록(블랙박스) 형식과 분석 스크립트

경기마다 JSON 파일 하나. 같은 `build`, `tune`, `seed`, `frames`로 `update` 루프를 다시 돌리면 원본과 같은 결과(요약 통계와 이벤트)가 나온다. 서버로 보내지 않고, 개인정보는 넣지 않는다(화면 크기와 입력 민감도만).

## 켜기, 보관, 내보내기
- 기록은 `?dev=1` 없이도 항상 켜져 있다. 시작 화면의 `RECORD ON/OFF`로 끈다.
- 기기(브라우저 localStorage)에는 최근 5경기만 보관한다(`fmFutsalLogs` 목록과 `fmFutsalLog:<경기id>`). 하프타임, 경기 종료, 페이지를 떠날 때 저장한다. 용량이 모자라면 오래된 경기부터 지운다.
- 경기 종료 화면과 일시정지 화면의 `기록 저장 SAVE LOG` 버튼으로 `futsal-log-YYYYMMDD-HHMMSS.json`을 내려받는다. `?dev=1` 패널의 `log` 버튼도 같다.

## 파일 구조
| 필드 | 내용 |
| --- | --- |
| `version` | 형식 버전(현재 1) |
| `build` | 빌드 번호(`futsalLog.mjs`의 `BUILD`. 규칙이나 형식을 바꿀 때 올린다) |
| `tune` | 그때의 `TUNE` 전체. 재생할 때 이 값을 `TUNE`에 얹는다 |
| `seed`, `stance`, `awayStance` | 경기 시드와 포메이션 |
| `teams` | `{home, away}`: 선수 목록(`id`, `name`, `gk`, `cond`, `ab` 능력치) |
| `device` | `{w, h, sens}`: 캔버스 표시 크기(px)와 입력 민감도 |
| `frames` | 입력 기록(아래) |
| `events` | 경기 이벤트(아래) |
| `summary` | `score`, `real`, `phase`, `half`, `shots`, `passes`, `passOk`, `passFail`, `intercepts`, `tackleOk`, `tackleFails`, `saves`, `goals` (재생 일치 검사에 쓴다) |

### frames
`update` 호출 한 번이 한 프레임이다. 기록과 재생이 똑같이 읽도록 `dt`는 ms로, 조이스틱은 소수 2자리로, 행동의 숫자는 소수 3자리로 양자화해서 넣는다. 같은 `dt`와 조이스틱이 이어지는 구간은 하나로 압축한다.
- 입력 프레임: `[반복 수, dt(ms), 조이스틱 x, 조이스틱 y, 행동 배열(있을 때만)]`. 조이스틱이 없으면 x, y는 `null`. 행동은 `{type:'tap'|'hold', wx, wy, ...}` 또는 `{type:'swipe', dx, dy, v}` 또는 `{type:'dribble', ...}`.
- 마커(객체): `{k:'half', stance}` 후반 시작, `{k:'auto', on}` 자동 진행(SIM), `{k:'gk'}` 플라잉 골키퍼 켜기, `{k:'stance', stance}`.

### events
공통: `t`(경기 시작부터 실제 초, 정지 구간 포함), `clock`(게임 시계 초), `kind`.
| kind | 값 |
| --- | --- |
| `pass` | `team`, `id`(패스한 선수), `type`('pass'|'spot'), `dist`(m), `clr`(패스 선 여유 m), `score`(난이도 점수 = 거리/5 + max(0, 2 − 여유)), `result`('ok'|'intercept'|'late'|'out'), `recvToDest`(끝났을 때 받는 선수와 도착 자리 거리), `lateDist`(공이 도착 자리에 멈췄을 때 거리. 받는 선수가 못 온 경우의 원인 값), `sec`(비행~결과 시간) |
| `shot` | `team`, `id`, `ang`(쓴 각도, 도, 쓸기가 아니면 null), `real`(공 궤적 각도, 도), `chance`(sure/good/normal/hard), `power`, `result`('goal'|'save'|'post'|'miss'|'block') |
| `tackle` | `team`, `id`, `input`('tap'=스탠딩, 'hold'=슬라이딩), `signal`(신호 보너스), `ok` |
| `control` | `from`, `to`, `reason`('pass'|'restart'|'possession'|'nearest-ball') |
| `restart` | `restartKind`(kickin/corner/goalkeeper/kickoff), `team`, `how`('joystick'|'tap-mate'|'tap-confirm'|'tap'|'auto'), `sec`(걸린 시간) |
| `kickoffWait` | 우리 팀 킥오프 대기: `how`, `sec` |
| `goal` | `team`, `id` |
교체 이벤트는 1단계에 교체 기능이 없어 아직 기록하지 않는다.

## 재생
```js
import { replayLog } from './next/proto/futsalLog.mjs';
const { M, events, summary } = replayLog(JSON.parse(text));   // summary가 log.summary와 같아야 한다
```
`replayLog`는 `log.tune`을 `TUNE`에 얹어 돌리고 끝나면 원래 값으로 되돌린다. 자동 테스트(`node --test next/tests/futsal.test.mjs`의 "기록 재생")가 JSON 왕복 후 일치를 검사한다.

## 분석 스크립트
```bash
node tools/analyzeLog.mjs futsal-log-20261028-143000.json
```
로그를 재생하면서 텍스트 보고서를 출력한다.
1. 재생 일치 검사(요약 통계가 기록과 같은가).
2. 쓸기 각도와 공 궤적 각도의 오차(평균, 최대).
3. 조이스틱 입력이 있는데 조종 선수가 움직이지 못한 구간과 이유(정지, 벌칙, 누움, 슛 준비, 재개/킥오프 대기, AI 전환, 이어받기 자동 이동, 이유 불명). 재개/킥오프 대기와 이어받기는 의도된 무시라 "정상"으로 표시한다.
4. 조종 선수 전환 횟수와 이유.
5. 패스 난이도별(점수 2.2 미만 쉬움, 3.3 초과 어려움) 성공과 실패 원인(가로채기, 받는 선수가 못 옴, 밖).
6. 태클 시도: 콕/꾹, 신호 사용 여부별 성공률.
7. 슛 찬스 등급과 결과.
8. 재개 선택 시간과 방식, 킥오프 대기 시간.
9. 체력 곡선(30초 간격).
10. 이상 징후: 0.3초 이상 입력이 무시된 비정상 구간, 조종 전환이 0.5초 안에 반복, 받는 선수가 도착 자리에서 3m 넘게 떨어진 패스, 12초 넘는 재개 선택, 15도 넘는 슛 각도 오차(종류별 개수와 처음 5개).

`build`가 스크립트의 `BUILD`와 다르면 규칙이 달라 재생 일치 검사가 실패할 수 있다고 알려 준다(그때는 같은 build의 코드를 체크아웃해서 돌린다).
