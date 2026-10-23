# 작업 규칙 (AI 코딩 에이전트용)

이 저장소는 `docs/work-guide.md`(작업 지도서)를 기준으로 개발한다. 작업 전에 반드시 읽는다.

- 한 번에 한 Phase의 한 체크박스씩 진행하고, 완료 기준을 확인한 뒤 다음으로 넘어간다.
- 서버 로직(functions/)은 Firebase 에뮬레이터 테스트를 함께 작성한다.
- 문항 정답·점수 계산은 클라이언트(android/)에 두지 않는다. 채점은 `functions/src/scoring.ts`.
- 광고 ID, `google-services.json` 등 Firebase 설정 파일은 커밋하지 않는다.
- 매직 넘버(문항 수, 제한 시간, 광고 빈도)는 Remote Config 기본값으로 관리한다.
  서버 기준값 `functions/src/config.ts` ↔ 앱 기본값 `android/app/src/main/res/xml/remote_config_defaults.xml`을 함께 바꾼다.
- 지도서 내용을 바꾸면 버전과 변경 이력을 갱신한다.

## 확인 명령

```bash
cd functions
npm test                    # 채점·문항검증 단위 테스트
npm run test:rules          # Firestore 보안 규칙 (에뮬레이터, Java 필요)
npm run validate:questions  # content/questions/*.json 검증
npm run typecheck
```
