import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Category } from "../../src/config";
import { createMatch, Ctx, finishMatch, getQuestion, submitAnswer } from "../../src/game/matchService";
import { clearQuestionCache } from "../../src/game/questionStore";

const PROJECT = "demo-quizduel";
let db: Firestore;
let clock = 0;

/** 정답은 항상 index % 4 번 보기 */
const answerOf = (i: number) => i % 4;

async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) throw new Error("FIRESTORE_EMULATOR_HOST 없음 — npm run test:emulator 로 실행");
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
}

async function seed(category: Category = "geo", count = 12) {
  const batch = db.batch();
  const qids: string[] = [];
  for (let i = 0; i < count; i++) {
    const qid = `${category}-${i}`;
    qids.push(qid);
    batch.set(db.doc(`questions/${qid}`), {
      category,
      difficulty: 1,
      text: `문제 ${i}`,
      choices: ["A", "B", "C", "D"],
      answerIndex: answerOf(i),
      explanation: `해설 ${i}`,
      status: "approved",
    });
  }
  batch.set(db.doc(`questionPools/${category}`), { qids });
  batch.set(db.doc("users/alice"), { nickname: "앨리스" });
  batch.set(db.doc("users/bob"), { nickname: "밥" });
  await batch.commit();
}

const ctx = (uid: string): Ctx => ({ db, uid, now: () => clock });

/** 문항 qid로 정답 찾기 (테스트 전용: 서버 데이터 직접 조회) */
async function correctChoice(matchId: string, uid: string, index: number): Promise<number> {
  const a = await db.doc(`matches/${matchId}/attempts/${uid}`).get();
  const qid = (a.get("qids") as string[])[index];
  return Number(qid.split("-")[1]) % 4;
}

beforeAll(() => {
  db = getFirestore(initializeApp({ projectId: PROJECT }, "match-test"));
});

afterAll(async () => {
  await Promise.all(getApps().map((a) => deleteApp(a)));
});

beforeEach(async () => {
  clock = 1_800_000_000_000;
  clearQuestionCache();
  await clearFirestore();
  await seed();
});

describe("createMatch", () => {
  it("10문제 세트와 대기 중 대결을 만든다", async () => {
    const { matchId, shareCode } = await createMatch(ctx("alice"), "geo");
    expect(shareCode).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);

    const m = (await db.doc(`matches/${matchId}`).get()).data()!;
    expect(m.status).toBe("waiting");
    expect(m.challenger).toEqual({ uid: "alice", nickname: "앨리스" });
    expect(m.expiresAt.toMillis() - clock).toBe(72 * 3_600_000);

    const a = (await db.doc(`matches/${matchId}/attempts/alice`).get()).data()!;
    expect(new Set(a.qids).size).toBe(10);
    expect((await db.doc(`questionSets/${m.setId}`).get()).get("questionIds")).toEqual(a.qids);
  });

  it("닉네임이 없으면 거부", async () => {
    await expect(createMatch(ctx("nobody"), "geo")).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("문항이 10개 미만인 카테고리는 거부", async () => {
    await expect(createMatch(ctx("alice"), "science")).rejects.toMatchObject({ code: "failed-precondition" });
  });
});

describe("getQuestion", () => {
  it("정답·해설 없이 문항을 내려준다", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    const q = await getQuestion(ctx("alice"), matchId, 0);
    expect(q).toMatchObject({ index: 0, total: 10, choices: ["A", "B", "C", "D"], startsInMs: 0, remainingMs: 10_000 });
    expect(Object.keys(q)).not.toContain("answerIndex");
    expect(Object.keys(q)).not.toContain("explanation");
  });

  it("같은 문항 재요청 시 servedAt을 새로 주지 않는다", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await getQuestion(ctx("alice"), matchId, 0);
    clock += 4_000;
    const again = await getQuestion(ctx("alice"), matchId, 0);
    expect(again.remainingMs).toBe(6_000);
  });

  it("건너뛰기·다른 사람 대결은 거부", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await expect(getQuestion(ctx("alice"), matchId, 1)).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(getQuestion(ctx("bob"), matchId, 0)).rejects.toMatchObject({ code: "not-found" });
    await expect(getQuestion(ctx("alice"), matchId, 10)).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("submitAnswer", () => {
  it("서버 시간으로 채점하고 정답·해설과 다음 문항을 돌려준다", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await getQuestion(ctx("alice"), matchId, 0);
    clock += 3_000;
    const choice = await correctChoice(matchId, "alice", 0);
    const r = await submitAnswer(ctx("alice"), matchId, 0, choice);

    expect(r).toMatchObject({ correct: true, points: 170, answerIndex: choice, totalScore: 170 });
    expect(r.explanation).toMatch(/^해설/);
    // 다음 문항은 정답 공개 1.5초 뒤 시작
    expect(r.next).toMatchObject({ index: 1, startsInMs: 1_500, remainingMs: 10_000 });
  });

  it("오답·무응답은 0점", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await getQuestion(ctx("alice"), matchId, 0);
    const wrong = ((await correctChoice(matchId, "alice", 0)) + 1) % 4;
    expect((await submitAnswer(ctx("alice"), matchId, 0, wrong)).points).toBe(0);
    clock += 1_500 + 11_000;
    expect((await submitAnswer(ctx("alice"), matchId, 1, null)).points).toBe(0);
  });

  it("12초를 넘긴 정답은 0점", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await getQuestion(ctx("alice"), matchId, 0);
    clock += 12_001;
    const r = await submitAnswer(ctx("alice"), matchId, 0, await correctChoice(matchId, "alice", 0));
    expect(r).toMatchObject({ correct: false, points: 0 });
  });

  it("같은 문항 두 번 제출·받지 않은 문항 제출은 거부", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await expect(submitAnswer(ctx("alice"), matchId, 0, 0)).rejects.toMatchObject({ code: "failed-precondition" });
    await getQuestion(ctx("alice"), matchId, 0);
    await submitAnswer(ctx("alice"), matchId, 0, 0);
    await expect(submitAnswer(ctx("alice"), matchId, 0, 1)).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(submitAnswer(ctx("alice"), matchId, 2, 1)).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("잘못된 보기 번호는 거부", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await getQuestion(ctx("alice"), matchId, 0);
    await expect(submitAnswer(ctx("alice"), matchId, 0, 4)).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("미리 받은 다음 문항을 다시 요청해도 시작 시각은 그대로", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await getQuestion(ctx("alice"), matchId, 0);
    await submitAnswer(ctx("alice"), matchId, 0, 0);
    clock += 5_500; // 공개 1.5초 + 4초 경과
    expect(await getQuestion(ctx("alice"), matchId, 1)).toMatchObject({ startsInMs: 0, remainingMs: 6_000 });
  });
});

/** 10문제를 모두 푼다. elapsed: 문항별 응답 시간(ms) */
async function playAll(uid: string, matchId: string, elapsed: number, correct = true) {
  await getQuestion(ctx(uid), matchId, 0);
  for (let i = 0; i < 10; i++) {
    if (i > 0) clock += 1_500; // 정답 공개 시간
    clock += elapsed;
    const right = await correctChoice(matchId, uid, i);
    await submitAnswer(ctx(uid), matchId, i, correct ? right : (right + 1) % 4);
  }
}

/** Phase 2 joinMatch 전까지 테스트에서 상대를 직접 등록 */
async function addOpponent(matchId: string, uid: string, nickname: string) {
  const a = (await db.doc(`matches/${matchId}/attempts/alice`).get()).data()!;
  await db.doc(`matches/${matchId}`).update({ opponent: { uid, nickname } });
  await db.doc(`matches/${matchId}/attempts/${uid}`).set({ ...a, answers: [], score: 0, finishedAt: null });
}

describe("finishMatch", () => {
  it("10문제를 풀면 서버 채점 점수가 확정된다 (Phase 1 완료 기준)", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await playAll("alice", matchId, 2_000);
    const r = await finishMatch(ctx("alice"), matchId);

    expect(r).toMatchObject({ score: 1_800, timeMs: 20_000, correctCount: 10, status: "waiting", opponent: null });
    expect(r.results).toHaveLength(10);
    const m = (await db.doc(`matches/${matchId}`).get()).data()!;
    expect(m.challenger.score).toBe(1_800);
    expect((await db.doc("users/alice").get()).get("stats.played")).toBe(1);
  });

  it("답하지 않은 문항은 0점·제한시간으로 처리", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await getQuestion(ctx("alice"), matchId, 0);
    await submitAnswer(ctx("alice"), matchId, 0, await correctChoice(matchId, "alice", 0)); // 0ms → 200점
    const r = await finishMatch(ctx("alice"), matchId);
    expect(r).toMatchObject({ score: 200, timeMs: 90_000, correctCount: 1 });
  });

  it("끝난 뒤에는 더 풀 수 없고, 다시 불러도 결과는 같다", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await playAll("alice", matchId, 1_000);
    const first = await finishMatch(ctx("alice"), matchId);
    const again = await finishMatch(ctx("alice"), matchId);
    expect(again.score).toBe(first.score);
    expect((await db.doc("users/alice").get()).get("stats.played")).toBe(1);
    await expect(getQuestion(ctx("alice"), matchId, 0)).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("양쪽이 끝나면 승패를 판정하고 전적을 갱신", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await addOpponent(matchId, "bob", "밥");
    await playAll("alice", matchId, 2_000);
    await finishMatch(ctx("alice"), matchId);
    await playAll("bob", matchId, 1_000);
    const r = await finishMatch(ctx("bob"), matchId);

    expect(r).toMatchObject({ status: "done", winnerUid: "bob", score: 1_900, opponent: { nickname: "앨리스", score: 1_800 } });
    const m = (await db.doc(`matches/${matchId}`).get()).data()!;
    expect(m).toMatchObject({ status: "done", winnerUid: "bob" });
    expect((await db.doc("users/bob").get()).get("stats")).toEqual({ played: 1, won: 1 });
    expect((await db.doc("users/alice").get()).get("stats")).toEqual({ played: 1, lost: 1 });
  });

  it("동점이면 소요시간이 짧은 쪽이 이긴다", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await addOpponent(matchId, "bob", "밥");
    await playAll("alice", matchId, 1_200); // 남은 8초 → 180점 × 10
    await finishMatch(ctx("alice"), matchId);
    await playAll("bob", matchId, 1_900); // 남은 8초 → 180점 × 10, 더 느림
    const r = await finishMatch(ctx("bob"), matchId);
    expect(r.score).toBe(1_800);
    expect(r.winnerUid).toBe("alice");
  });

  it("참가자가 아니면 거부", async () => {
    const { matchId } = await createMatch(ctx("alice"), "geo");
    await expect(finishMatch(ctx("carol"), matchId)).rejects.toMatchObject({ code: "not-found" });
  });
});
