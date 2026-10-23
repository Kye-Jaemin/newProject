import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-quizduel",
    firestore: { rules: readFileSync(resolve(__dirname, "../../../firestore.rules"), "utf8") },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "questions/q1"), { text: "Q", choices: ["a", "b", "c", "d"], answerIndex: 0 });
    await setDoc(doc(db, "questionSets/s1"), { questionIds: ["q1"] });
    await setDoc(doc(db, "users/alice"), { nickname: "앨리스", createdAt: new Date(), stats: { played: 0 } });
    await setDoc(doc(db, "matches/m1"), {
      challenger: { uid: "alice", nickname: "앨리스", score: 1500 },
      opponent: { uid: "bob" },
      status: "waiting",
    });
    await setDoc(doc(db, "matches/m2"), { challenger: { uid: "alice" }, status: "waiting" });
    await setDoc(doc(db, "matches/m1/attempts/alice"), { answers: [{ qid: "q1", choice: 0, correct: true }] });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe("questions / questionSets", () => {
  it("로그인해도 읽기·쓰기 불가", async () => {
    await assertFails(getDoc(doc(as("alice"), "questions/q1")));
    await assertFails(setDoc(doc(as("alice"), "questions/q2"), { text: "x" }));
    await assertFails(getDoc(doc(as("alice"), "questionSets/s1")));
  });
});

describe("users", () => {
  it("본인 문서만 읽기", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "users/alice")));
    await assertFails(getDoc(doc(as("bob"), "users/alice")));
    await assertFails(getDoc(doc(anon(), "users/alice")));
  });

  it("닉네임으로 최초 생성 가능", async () => {
    await assertSucceeds(
      setDoc(doc(as("bob"), "users/bob"), { nickname: "밥", createdAt: serverTimestamp() }),
    );
  });

  it("생성 시 전적·횟수를 직접 넣을 수 없음", async () => {
    await assertFails(
      setDoc(doc(as("bob"), "users/bob"), {
        nickname: "밥",
        createdAt: serverTimestamp(),
        stats: { played: 99, won: 99, lost: 0 },
      }),
    );
  });

  it("닉네임 길이 제한", async () => {
    await assertFails(setDoc(doc(as("bob"), "users/bob"), { nickname: "", createdAt: serverTimestamp() }));
    await assertFails(
      setDoc(doc(as("bob"), "users/bob"), { nickname: "가".repeat(13), createdAt: serverTimestamp() }),
    );
  });

  it("닉네임·토큰은 수정 가능, 전적은 불가", async () => {
    await assertSucceeds(updateDoc(doc(as("alice"), "users/alice"), { nickname: "새이름", fcmToken: "t" }));
    await assertFails(updateDoc(doc(as("alice"), "users/alice"), { "stats.played": 100 }));
    await assertFails(
      updateDoc(doc(as("alice"), "users/alice"), { dailyPlays: { date: "2026-10-22", count: 0, bonus: 0 } }),
    );
  });

  it("다른 사람 문서 수정 불가", async () => {
    await assertFails(updateDoc(doc(as("bob"), "users/alice"), { nickname: "해킹" }));
  });
});

describe("matches", () => {
  it("참가자만 읽기", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "matches/m1")));
    await assertSucceeds(getDoc(doc(as("bob"), "matches/m1")));
    await assertFails(getDoc(doc(as("carol"), "matches/m1")));
    await assertFails(getDoc(doc(anon(), "matches/m1")));
  });

  it("상대가 아직 없는 대결은 도전자만 읽기", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "matches/m2")));
    await assertFails(getDoc(doc(as("bob"), "matches/m2")));
  });

  it("클라이언트는 점수를 쓸 수 없음", async () => {
    await assertFails(updateDoc(doc(as("alice"), "matches/m1"), { "challenger.score": 2000 }));
    await assertFails(setDoc(doc(as("alice"), "matches/m3"), { challenger: { uid: "alice" } }));
  });

  it("attempts는 본인 것만 읽고, 아무도 쓸 수 없음", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "matches/m1/attempts/alice")));
    await assertFails(getDoc(doc(as("bob"), "matches/m1/attempts/alice")));
    await assertFails(setDoc(doc(as("bob"), "matches/m1/attempts/bob"), { answers: [] }));
  });
});
