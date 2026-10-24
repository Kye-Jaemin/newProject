# 서버 API (Callable) — 앱 연동 가이드

리전 `asia-northeast3`. 모든 함수는 로그인(익명 포함) 필요. 오류는 Firebase `HttpsError` 코드로 온다.

## 한 판 흐름

```
createMatch(category)            → { matchId, shareCode }
getQuestion(matchId, 0)          → 첫 문항
submitAnswer(matchId, i, choice) → 채점 결과 + 다음 문항(next)   ×10
finishMatch(matchId)             → 최종 결과
```

한 판에 함수 호출 13회. 2번째 문항부터는 `submitAnswer` 응답의 `next`를 쓰고 `getQuestion`을 부르지 않는다.
`getQuestion`은 첫 문항과 앱 재시작 후 이어하기에만 쓴다.

## 함수

### createMatch
- 입력: `{ category: "history" | "science" | "geo" | "culture" | "sports" | "general" }`
- 출력: `{ matchId, shareCode }`
- 오류: `failed-precondition` (닉네임 없음, 문항 부족)

### getQuestion
- 입력: `{ matchId, index }` — index는 다음에 풀 문항 번호(0부터)
- 출력: `QuestionPayload`
- 같은 문항을 다시 요청하면 시작 시각이 유지된다(타이머 리셋 불가).
- 오류: `failed-precondition` (이미 답함, 앞 문항 미완료, 끝난 대결), `not-found` (참가 안 함)

### submitAnswer
- 입력: `{ matchId, index, choice }` — choice는 0~3, 시간 초과는 `null`
- 출력:
  ```
  { correct, points, answerIndex, explanation, totalScore, next: QuestionPayload | null }
  ```
- `next == null`이면 마지막 문항 → `finishMatch` 호출.

### finishMatch
- 입력: `{ matchId }`
- 출력:
  ```
  { matchId, score, timeMs, correctCount, results: [{correct, points}] x10,
    status: "waiting" | "done", winnerUid: string | null,
    opponent: { nickname, score? } | null }
  ```
- 답하지 않은 문항은 0점·10초로 처리. 여러 번 불러도 결과는 같다.

## QuestionPayload

```
{ index, total, text, choices: [4], startsInMs, remainingMs }
```

- 정답·해설은 들어 있지 않다.
- **startsInMs**: 이 시간 뒤에 문항을 표시하고 타이머를 시작한다. `next`는 정답 공개 시간(1.5초)만큼 늦게 시작하도록 배정되므로, 앱은 정답·해설을 `startsInMs` 동안 보여준 뒤 다음 문항으로 넘어가면 된다.
- **remainingMs**: 문항 시작 후 남은 제한시간. 보통 10,000, 이어하기면 더 작다. 타이머 바는 이 값으로 그린다.
- 점수는 서버 시각으로 계산하므로 앱 타이머는 표시용이다. 타이머가 0이 되면 `choice: null`로 제출한다.

## 점수

정답 100 + 남은 초(내림) × 10, 오답·시간초과 0점. 서버 기준 12초(10초 + 네트워크 여유 2초)를 넘기면 0점. 한 판 최고 2,000점.
