# 상식 퀴즈 대결 (가칭)

친구에게 카톡 링크로 퀴즈 도전장을 보내고, 상대가 나중에 같은 10문제를 풀어 점수로 승부를 가리는 안드로이드 상식 퀴즈 게임.

기획·규칙·일정은 [작업 지도서](docs/work-guide.md)를 따른다.

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `android/` | Kotlin + Jetpack Compose 앱 (MVVM, Hilt, Firebase) |
| `functions/` | Cloud Functions (TypeScript) — 채점·대결 로직, 테스트 |
| `content/questions/` | 문항 JSON (지도서 7-3 형식) |
| `firestore.rules` | Firestore 보안 규칙 |
| `docs/` | 작업 지도서 |

## 진행 현황

### Phase 0 — 준비

- [x] 저장소 구조, Firebase 설정(`firebase.json`, 에뮬레이터), `.gitignore`
- [x] Compose 앱 뼈대 + 익명 로그인 + 서버 연결 확인(`whoami`)
- [x] 게임 규칙 기본값(서버 `config.ts` / 앱 Remote Config 기본값)
- [x] 채점·승패 판정 로직 + 단위 테스트
- [x] Firestore 보안 규칙 + 에뮬레이터 테스트
- [x] 문항 검증 도구 + 샘플 18문항 (카테고리별 3개, **사람 검수 전**)
- [ ] 앱 이름·패키지명 확정 (현재 임시 `com.quizduel.app`), 도메인 확보
- [ ] Firebase 프로젝트 생성(Blaze + 예산 알림), AdMob 앱 등록
- [ ] 문항 200개 생성·검수

완료 기준: 빈 Compose 앱이 Firebase에 연결되고 익명 로그인 성공 → Firebase 프로젝트 연결 후 실기기/에뮬레이터에서 확인 필요

### Phase 1 — 혼자 플레이

- [ ] 닉네임 입력, 홈, 카테고리 선택 화면
- [x] `getQuestion` / `submitAnswer` / `finishMatch` 구현 (+ 최소 `createMatch`, 문항 가져오기 스크립트) — [API 문서](docs/api.md)
- [ ] 퀴즈 플레이 화면(타이머, 채점, 해설), 결과 화면
- [x] Firestore 보안 규칙 + 에뮬레이터 테스트

## 로컬 실행

### 서버 (functions)

```bash
cd functions
npm install
npm test                    # 단위 테스트
npm run test:emulator       # 보안 규칙 + 게임 흐름 테스트 (Firestore 에뮬레이터, Java 11+ 필요)
npm run validate:questions  # 문항 검증
```

문항 넣기(에뮬레이터, 개발용 전부 승인):
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run import:questions -- --approve-all`

에뮬레이터 전체 실행: 루트에서 `npx --prefix functions firebase emulators:start`
(`.firebaserc`의 `demo-quizduel`은 에뮬레이터 전용 데모 프로젝트 ID)

### 앱 (android)

1. Firebase 콘솔에서 Android 앱(패키지 `com.quizduel.app`)을 등록하고 `google-services.json`을 `android/app/`에 둔다. (커밋 금지)
2. Android Studio로 `android/` 폴더를 연다.
3. debug 빌드는 기본적으로 로컬 에뮬레이터(`10.0.2.2`)에 붙는다. 실제 Firebase로 테스트하려면 `app/build.gradle.kts`의 debug `USE_EMULATOR`를 `false`로 바꾼다.
4. 실행하면 익명 로그인 → 서버 `whoami` 호출 → 화면에 uid가 표시되면 Phase 0 완료.
