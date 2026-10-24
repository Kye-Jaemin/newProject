# 비동기 상식 퀴즈 대결 앱 — 작업 지도서 (v0.2)

- 작성일: 2026-10-22
- 목적: 이 문서를 기준으로 MVP를 단계별로 구현한다. AI 코딩 에이전트에게 작업을 맡길 때도 이 문서를 컨텍스트로 제공한다.
- 원칙: 작게 만들고, 빨리 출시하고, 지표로 판단한다.

## 0. 한 줄 정의

친구에게 카톡 링크로 퀴즈 도전장을 보내고, 상대가 나중에 같은 문제를 풀어 점수로 승부를 가리는 안드로이드 상식 퀴즈 게임. 수익은 보상형 광고 중심.

## 1. 제품 범위

### 1-1. MVP에 포함 (Must)

| # | 기능 | 설명 |
|---|---|---|
| F1 | 익명 시작 | 회원가입 없이 바로 플레이. 닉네임만 입력 |
| F2 | 도전장 만들기 | 카테고리 선택 → 10문제 풀기 → 결과 저장 → 공유 링크 생성 |
| F3 | 도전장 받기 | 링크로 앱 진입(미설치 시 스토어) → 같은 10문제 풀기 → 결과 비교 |
| F4 | 고스트 대결 | 친구가 없을 때, 같은 문제 세트를 먼저 푼 다른 유저 기록과 대결 |
| F5 | 대결 목록 | 내가 보낸/받은 도전장 상태(대기·완료·승패) |
| F6 | 푸시 알림 | "OO님이 도전장에 응답했어요" |
| F7 | 보상형 광고 | 힌트(50:50), 하루 추가 도전권 |
| F8 | 배너 광고 | 로비·결과 화면 하단만 |

### 1-2. MVP에서 제외 (Later)

- 실시간 대결, 랭킹/리그, 친구 목록·채팅, 소셜 로그인, 인앱결제, iOS, 다국어
- 전면광고(Phase 2에서 빈도 제한 걸고 테스트)

### 1-3. 게임 규칙 (초기값, 이후 지표 보고 조정)

| 항목 | 값 |
|---|---|
| 한 판 문제 수 | 10문제 |
| 문항 형식 | 4지선다 |
| 제한 시간 | 문항당 10초 |
| 점수 | 정답 시 100 + 남은시간(초) × 10, 오답·시간초과 0점 |
| 승패 | 총점 비교, 동점이면 총 소요시간이 짧은 쪽 승 |
| 도전장 유효기간 | 72시간 (만료 시 고스트 대결로 전환 가능) |
| 무료 도전 횟수 | 하루 10판 (보상형 광고 1회 시청 +3판) |

## 2. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 앱 | Kotlin + Jetpack Compose | 안드로이드 표준, AI 코딩 도구 지원 양호 |
| 구조 | MVVM + Repository, Hilt(DI) | 화면/데이터 분리 |
| 인증 | Firebase Auth (익명) | 가입 장벽 제거, 이후 계정 연동 가능 |
| DB | Cloud Firestore | 서버리스, 비동기 대결에 적합 |
| 서버 로직 | Cloud Functions (TypeScript) | 정답 검증·채점을 서버에서 처리 |
| 푸시 | Firebase Cloud Messaging | |
| 딥링크 | Android App Links + Firebase Hosting 랜딩 페이지 | Firebase Dynamic Links는 종료된 서비스이므로 사용하지 않음 |
| 광고 | Google AdMob (보상형·배너) | 미디에이션은 Phase 3 |
| 분석 | Firebase Analytics + Crashlytics | |
| 원격 설정 | Firebase Remote Config | 문항 수·시간·광고 빈도를 앱 업데이트 없이 조정 |

> 비용 메모: Cloud Functions는 Firebase Blaze(종량제) 요금제가 필요하다. 무료 사용량이 있으므로 MVP 단계에서는 비용이 크지 않을 것으로 예상하지만, 예산 알림을 반드시 설정한다. (요금 수치는 출시 전 공식 요금표로 재확인)

## 3. 데이터 모델 (Firestore)

```
users/{uid}
  nickname: string
  createdAt: timestamp
  fcmToken: string
  dailyPlays: { date: "2026-10-22", count: 3, bonus: 0 }
  stats: { played, won, lost }

questions/{qid}                  // 클라이언트 읽기 금지 (서버 전용)
  category: "history" | "science" | "geo" | "culture" | "sports" | "general"
  difficulty: 1 | 2 | 3
  text: string
  choices: [string, string, string, string]
  answerIndex: 0..3
  explanation: string
  source: string                 // 근거 출처 (검수용)
  status: "draft" | "approved" | "retired"
  stats: { served, correct }     // 정답률로 난이도 자동 보정

questionPools/{category}         // 서버 전용. 승인 문항 qid 목록 (문항 가져오기 스크립트가 갱신)
  qids: [qid, ...]

questionSets/{setId}
  category, questionIds: [qid x 10], createdAt

matches/{matchId}
  setId: string
  type: "friend" | "ghost"
  challenger: { uid, nickname, score, timeMs, finishedAt }
  opponent:   { uid?, nickname?, score?, timeMs?, finishedAt? }
  status: "waiting" | "done" | "expired"
  winnerUid: string | null
  expiresAt: timestamp
  shareCode: string              // 링크용 짧은 코드

matches/{matchId}/attempts/{uid} // 서버만 쓰기, 본인만 읽기
  qids: [qid x 10]               // 진행 중에는 이 문서 하나만 읽고 쓴다 (비용 절감)
  answers: [{ qid, choice, servedAt, answeredAt, correct, points, elapsedMs }]
  score, finishedAt
```

**보안 규칙 핵심**

- `questions`는 클라이언트에서 읽기 금지. 문제는 Functions가 한 문항씩 내려준다(정답 제외).
- `attempts`, 점수 필드는 서버(Functions)만 쓰기.
- `matches`는 참가자만 읽기 가능.

## 4. 서버 API (Cloud Functions, callable)

| 함수 | 입력 | 처리 | 출력 |
|---|---|---|---|
| createMatch | category | 한도 확인 → 문제 세트 생성/재사용 → match 생성 | matchId, shareCode |
| joinMatch | shareCode | 유효성·만료·본인여부 확인 → opponent 등록 | matchId |
| startGhostMatch | category | 완료 기록이 있는 세트 중 랜덤 선택 → 고스트 match 생성 | matchId |
| getQuestion | matchId, index | 문항 내려주기(정답 제외), servedAt 기록. 첫 문항·이어하기용 | text, choices, startsInMs, remainingMs |
| submitAnswer | matchId, index, choice | 서버 시간으로 경과 계산 → 채점 → 저장 → 다음 문항 배정 | correct, points, answerIndex, explanation, next(다음 문항) |
| finishMatch | matchId | 총점 확정 → 양쪽 완료 시 승패 판정 → 푸시 발송 | 결과 |
| grantRewardPlays | — | 보상형 광고 시청 후 추가 도전권 부여 | 남은 횟수 |
| useHint | matchId, index | 오답 2개 제거 정보 반환 | 제거할 보기 인덱스 |

**부정행위 방지 원칙**

1. 정답은 답을 제출한 뒤에만 클라이언트로 보낸다.
2. 경과 시간은 서버 기준(`answeredAt - servedAt`)으로 계산한다. 10초 + 네트워크 여유 2초 초과 시 0점.
3. 같은 문항 재요청 시 새 `servedAt`을 주지 않는다.
4. 다음 문항은 `submitAnswer` 응답에 함께 싣되, servedAt을 정답 공개 시간(1.5초)만큼 미래로 잡는다. (함수 호출 22회 → 13회. 정답 공개 동안 문제를 미리 볼 수 있지만 점수 상한은 같아 이득이 작다. 비정상 기록 플래그로 감시)
5. 보상형 광고 보상은 Phase 2에서 AdMob 서버 측 확인(SSV)으로 전환한다. MVP는 클라이언트 콜백 + 하루 상한으로 대체.

## 5. 화면 구성

```
스플래시 → (최초) 닉네임 입력
        → 홈(로비)
            ├─ [도전장 보내기] → 카테고리 선택 → 퀴즈 플레이 → 결과 → 공유 시트(카톡 등)
            ├─ [랜덤 상대와 대결] → 카테고리 선택 → 퀴즈 플레이 → 고스트 결과
            ├─ 대결 목록 (대기 중 / 완료)
            └─ 설정 (닉네임, 알림, 개인정보처리방침)
딥링크 진입 → 도전장 미리보기("OO님이 2,350점으로 도전!") → 퀴즈 플레이 → 비교 결과 → [리매치] [다른 친구에게 도전]
```

**화면별 체크포인트**

- 퀴즈 플레이: 타이머 바, 문항 번호(3/10), 보기 4개, 힌트 버튼(광고 아이콘). 답 선택 후 정답·해설 1.5초 노출 후 자동 진행. 플레이 중 광고 없음.
- 결과: 내 점수 / 상대 점수(대기 중이면 "응답 기다리는 중"), 문항별 O/X, 공유 버튼을 가장 크게.
- 공유 문구 예시: "나 상식퀴즈 2,350점 나옴. 이길 수 있으면 와봐 👉 {링크}"

## 6. 딥링크 / 공유 흐름

1. `createMatch`가 shareCode 발급 → 링크 `https://{도메인}/c/{shareCode}`
2. Firebase Hosting에 랜딩 페이지 배포: 도전 정보 미리보기 + "앱에서 열기 / 스토어로 이동"
3. 앱에 App Links 설정(`assetlinks.json` 호스팅) → 설치 사용자는 앱으로 바로 진입
4. 미설치 사용자는 스토어 설치 후 첫 실행 시 코드 입력 화면 또는 Play Install Referrer로 코드 복원 (MVP는 수동 코드 입력으로 단순화 가능)
5. 카톡 공유 시 미리보기가 잘 나오도록 랜딩 페이지에 OG 태그(title, description, image) 설정

## 7. 문제(콘텐츠) 파이프라인

### 7-1. 목표 수량

| 시점 | 승인 문항 수 |
|---|---|
| 출시 | 카테고리 6개 × 100문항 = 600문항 |
| 출시 후 | 주 50~100문항 추가 (주간 테마팩) |

### 7-2. 생성·검수 절차

1. AI로 카테고리·난이도별 초안 생성 (아래 JSON 형식)
2. 사람이 검수: 사실관계, 보기 중복·애매함, 시의성(정답이 바뀔 수 있는 문제 제외), 민감 주제
3. `source` 필드에 근거 출처 기록
4. `status: approved`만 출제
5. 출시 후 정답률 데이터로 난이도 자동 보정, 정답률이 극단적인 문항(95% 초과·5% 미만)은 재검토

### 7-3. 문항 JSON 형식

```json
{
  "category": "geo",
  "difficulty": 2,
  "text": "다음 중 아프리카 대륙에 속하지 않는 나라는?",
  "choices": ["케냐", "모로코", "페루", "가나"],
  "answerIndex": 2,
  "explanation": "페루는 남아메리카에 있는 나라입니다.",
  "source": "참고 출처 URL 또는 문헌"
}
```

### 7-4. 출제 금지 기준

- "현재", "최근", "최초/최대" 등 시간이 지나면 정답이 바뀌는 문제
- 정치·종교·특정 인물 비방 관련
- 정답이 2개 이상 될 수 있는 문제
- 저작권 있는 가사·문장 인용

## 8. 광고 설계

| 위치 | 형식 | 규칙 |
|---|---|---|
| 로비, 결과 화면 하단 | 배너 | 버튼과 충분히 떨어뜨려 오클릭 방지 |
| 힌트 버튼 | 보상형 | 한 판 최대 2회 |
| 도전 횟수 소진 시 | 보상형 | 시청 시 +3판, 하루 최대 3회 |
| 결과 화면 이후 | 전면광고 | MVP 제외. Phase 2에서 "3판에 1회" 등 빈도 제한 A/B 테스트 |

- 개발 중에는 반드시 테스트 광고 ID 사용 (실제 광고 자가 클릭은 계정 정지 사유)
- 유럽 등 동의 필요 지역 대비 UMP(동의 관리) SDK 적용
- 광고 정책 위반 여부는 AdMob 공식 정책 문서 기준으로 출시 전 점검

## 9. 출시 준비 체크리스트

- [ ] 개인정보처리방침 페이지 (Firebase Hosting) — 익명 ID, 광고 ID, 푸시 토큰 수집 명시
- [ ] Play Console 데이터 보안(Data safety) 섹션 작성
- [ ] 콘텐츠 등급 설문
- [ ] 광고 포함 여부 표시
- [ ] 대상 연령 설정 (아동 대상이 아님을 명확히 → 아동용 광고 정책 회피)
- [ ] 최신 Play 정책의 Target API 레벨 요구사항 충족 여부 확인
- [ ] 비공개 테스트 트랙 운영 (신규 개인 개발자 계정의 테스트 요구 조건은 출시 시점 Play Console 안내로 확인)
- [ ] 스토어 스크린샷 5장, 짧은 설명, 아이콘
- [ ] Firebase 예산 알림 설정

## 10. 단계별 작업 계획

### Phase 0 — 준비 (1주)

- [ ] 앱 이름·패키지명 확정, 도메인 확보
- [ ] Firebase 프로젝트 생성(Blaze + 예산 알림), AdMob 앱 등록
- [ ] 문항 200개 생성·검수 시작

완료 기준: 빈 Compose 앱이 Firebase에 연결되고 익명 로그인 성공

### Phase 1 — 혼자 플레이 (1~2주)

- [ ] 닉네임 입력, 홈, 카테고리 선택 화면
- [ ] `getQuestion` / `submitAnswer` / `finishMatch` 구현
- [ ] 퀴즈 플레이 화면(타이머, 채점, 해설), 결과 화면
- [ ] Firestore 보안 규칙 + 에뮬레이터 테스트

완료 기준: 10문제를 풀고 서버 채점 점수가 결과 화면에 표시됨. 클라이언트에서 정답 조회 불가 확인

### Phase 2 — 비동기 대결 (2주)

- [ ] `createMatch` / `joinMatch`, 공유 링크 + 랜딩 페이지 + App Links
- [ ] 대결 목록 화면, 결과 비교 화면, 리매치
- [ ] FCM 푸시 (응답 완료 알림, 만료 24시간 전 알림)
- [ ] `startGhostMatch` (고스트 대결)
- [ ] 도전장 만료 처리 (스케줄 함수)

완료 기준: 기기 2대로 링크 공유 → 상대 플레이 → 양쪽에 승패 표시 + 푸시 수신

### Phase 3 — 수익화·출시 (1~2주)

- [ ] AdMob 배너·보상형, UMP 동의
- [ ] 하루 도전 횟수 + 광고 보상
- [ ] Analytics 이벤트 심기 (11장)
- [ ] Remote Config 연결
- [ ] 문항 600개 승인 완료
- [ ] 비공개 테스트 → 프로덕션 출시

완료 기준: 스토어 공개, 실제 광고 노출 확인

### Phase 4 — 출시 후 개선 (지속)

지표 확인 후 결정: 전면광고 빈도 테스트, AdMob SSV, 광고 미디에이션, 주간 테마팩, 랭킹, 계정 연동

## 11. 지표 설계

### 11-1. 꼭 심어야 할 이벤트

| 이벤트 | 파라미터 |
|---|---|
| match_create | category, type |
| share_click | matchId, channel |
| deeplink_open | shareCode, installed(Y/N) |
| match_join | matchId |
| match_finish | score, type |
| rematch_click | matchId |
| hint_ad_view / plays_ad_view | — |
| daily_limit_hit | — |

### 11-2. 판단 기준 (출시 후 4~8주)

| 지표 | 계속 진행 신호 | 재검토 신호 |
|---|---|---|
| 도전장 응답률 (받은 링크 중 플레이 완료) | 30% 이상 | 15% 미만 |
| K-factor (1명이 데려오는 신규 유저) | 0.3 이상 | 0.1 미만 |
| D1 리텐션 | 35% 이상 | 20% 미만 |
| D7 리텐션 | 12% 이상 | 5% 미만 |
| 광고 ARPDAU | $0.02 이상 | $0.008 미만 |

위 기준값은 공개 벤치마크(퀴즈 장르 상위권 D1 최대 48%, 전체 중앙값 D1 약 25%·D7 약 5% — GameAnalytics)를 참고한 작업용 가정치이며, 실제 데이터를 보고 조정한다.

가장 중요한 지표는 도전장 응답률과 K-factor. 이 게임의 유입 엔진은 공유 링크뿐이므로, 이 두 값이 낮으면 광고 최적화보다 공유·도전 경험 개선을 먼저 한다.

## 12. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 친구가 링크를 열지 않음 | 공유 문구·미리보기 이미지 A/B, 고스트 대결로 혼자서도 재미 보장 |
| 문제 오류로 신뢰 하락 | 문항별 "문제 신고" 버튼, 신고 3회 이상 자동 출제 중지 |
| 문제 고갈·반복 | 유저별 최근 출제 이력 제외, 주간 테마팩 |
| 서버비 급증 | 예산 알림, 문항 세트 캐싱, 함수 호출 수 모니터링 |
| 광고 계정 정지 | 테스트 ID 철저, 오클릭 유도 배치 금지 |
| 점수 조작 | 서버 채점·서버 시간 기준, 비정상 기록(전문항 1초 이내 정답 등) 플래그 |

## 13. AI 코딩 에이전트 작업 규칙

- 한 번에 한 Phase의 한 체크박스씩 요청하고, 완료 기준을 확인한 뒤 다음으로 넘어간다.
- 서버 로직은 반드시 Firebase 에뮬레이터 테스트를 함께 작성한다.
- 문항 정답, 점수 계산을 클라이언트 코드에 두지 않는다.
- 광고 ID, Firebase 설정 파일은 저장소에 커밋하지 않는다(`.gitignore`).
- 매직 넘버(문항 수, 제한 시간, 광고 빈도)는 Remote Config 기본값으로 관리한다.
- 변경 시 이 문서의 버전과 변경 이력을 갱신한다.

## 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v0.1 | 2026-10-22 | 최초 작성 (비동기 대결 방식 확정) |
| v0.2 | 2026-10-24 | 서버비 절감: submitAnswer가 다음 문항을 함께 반환, attempts에 qids 복사, questionPools 추가, 문항 메모리 캐시. createMatch 최소 구현을 Phase 1로 당김(혼자 플레이에 필요) |
