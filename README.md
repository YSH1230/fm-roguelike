# FM-Roguelike

5부 리그 감독으로 시작해 선수를 사고 팔며 1부 정상까지 올라가는 축구 감독 로그라이크.

- 플레이: https://ysh1230.github.io/fm-roguelike/ui/
- 순수 HTML/CSS/JavaScript(ES 모듈)로 만들었고, 서버 없이 브라우저에서 돌아갑니다.
- 진행 기록은 각자의 브라우저에만 저장됩니다. 플레이 통계는 익명으로 수집되며(이름 등 개인정보 없음) 시작 화면에서 끌 수 있습니다.

## 저작권

© 2026 유시헌. 모든 권리를 보유합니다. 코드, 데이터, 그래픽, 문구, 게임 이름은 허락 없이 복사·수정·재배포·재호스팅할 수 없습니다.
자세한 내용은 [LICENSE](LICENSE)를 참고하세요. 제3자 폰트(Anton, 나눔스퀘어 네오, 서울로, Pretendard)는 각자의 라이선스를 따릅니다.

## 개발

```bash
node --test tests/*.test.mjs   # 테스트
node tools/dev-server.mjs      # 로컬 서버
```

폴더: `engine/`(규칙·계산) · `data/`(선수·구단·기록) · `ui/`(화면) · `tests/` · `tools/`(시뮬레이션·밸런스 도구)
