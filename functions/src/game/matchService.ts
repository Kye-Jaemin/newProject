import { randomInt } from "node:crypto";
import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { Category, DEFAULT_RULES, GameRules } from "../config";
import { decideWinner, scoreAnswer } from "../scoring";
import { loadPool, loadQuestion } from "./questionStore";

/**
 * 대결 진행 로직 (지도서 4장). Callable 래퍼(index.ts)와 분리해 에뮬레이터에서 직접 테스트한다.
 *
 * 비용 설계
 * - 한 판에 필요한 qid 목록을 attempts/{uid} 문서에 복사해 두어, 문항 진행 중에는
 *   그 문서 하나만 읽고 쓴다 (matches 문서는 시작·종료 때만 읽음).
 * - submitAnswer 응답에 다음 문항을 함께 실어, 문항마다 getQuestion을 따로 부르지 않는다.
 *   getQuestion은 첫 문항과 앱 재시작 후 이어하기에만 쓴다.
 * - 문항 본문은 questionStore의 메모리 캐시에서 읽는다.
 */

export interface AnswerRecord {
  qid: string;
  servedAt: Timestamp;
  answeredAt?: Timestamp;
  choice?: number | null;
  correct?: boolean;
  points?: number;
  elapsedMs?: number;
}

export interface AttemptDoc {
  matchId: string;
  setId: string;
  qids: string[];
  answers: AnswerRecord[];
  score: number;
  finishedAt: Timestamp | null;
}

export interface PlayerSlot {
  uid: string;
  nickname: string;
  score?: number;
  timeMs?: number;
  finishedAt?: Timestamp;
}

export interface MatchDoc {
  setId: string;
  category: Category;
  type: "friend" | "ghost";
  challenger: PlayerSlot;
  opponent: Partial<PlayerSlot>;
  status: "waiting" | "done" | "expired";
  winnerUid: string | null;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  shareCode: string;
}

/** 클라이언트로 내려가는 문항. 정답·해설은 포함하지 않는다. */
export interface QuestionPayload {
  index: number;
  total: number;
  text: string;
  choices: string[];
  /** 이 시간(ms) 뒤에 문항을 보여주고 타이머를 시작한다 (정답 공개 시간만큼 지연) */
  startsInMs: number;
  /** 문항이 시작된 뒤 남은 제한시간 (이어하기 시 10초보다 작을 수 있음) */
  remainingMs: number;
}

export interface AnswerResult {
  correct: boolean;
  points: number;
  answerIndex: number;
  explanation: string;
  totalScore: number;
  /** 마지막 문항이면 null → finishMatch 호출 */
  next: QuestionPayload | null;
}

export interface FinishResult {
  matchId: string;
  score: number;
  timeMs: number;
  correctCount: number;
  results: { correct: boolean; points: number }[];
  status: MatchDoc["status"];
  /** 양쪽이 모두 끝났을 때만 의미 있음. 무승부면 null */
  winnerUid: string | null;
  opponent: { nickname?: string; score?: number } | null;
}

export interface Ctx {
  db: Firestore;
  uid: string;
  now?: () => number;
  rules?: GameRules;
}

const SHARE_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 헷갈리는 0/O, 1/I 제외
const SHARE_CODE_LENGTH = 8;

function nowOf(ctx: Ctx): number {
  return ctx.now ? ctx.now() : Date.now();
}

function rulesOf(ctx: Ctx): GameRules {
  return ctx.rules ?? DEFAULT_RULES;
}

export function newShareCode(): string {
  let code = "";
  for (let i = 0; i < SHARE_CODE_LENGTH; i++) {
    code += SHARE_CODE_ALPHABET[randomInt(SHARE_CODE_ALPHABET.length)];
  }
  return code;
}

/** 배열에서 n개를 무작위로 고른다 (Fisher–Yates 부분 셔플) */
export function pickRandom<T>(items: readonly T[], n: number): T[] {
  const arr = items.slice();
  const count = Math.min(n, arr.length);
  for (let i = 0; i < count; i++) {
    const j = i + randomInt(arr.length - i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

function attemptRef(ctx: Ctx, matchId: string) {
  return ctx.db.collection("matches").doc(matchId).collection("attempts").doc(ctx.uid);
}

async function buildPayload(
  ctx: Ctx,
  attempt: AttemptDoc,
  index: number,
  now: number,
): Promise<QuestionPayload> {
  const rules = rulesOf(ctx);
  const q = await loadQuestion(ctx.db, attempt.qids[index]);
  const servedAt = attempt.answers[index].servedAt.toMillis();
  const startsInMs = Math.max(0, servedAt - now);
  const remainingMs = Math.max(0, rules.timeLimitMs - Math.max(0, now - servedAt));
  return { index, total: attempt.qids.length, text: q.text, choices: q.choices, startsInMs, remainingMs };
}

/**
 * 도전장 생성 (Phase 1 범위: 문제 세트 + match + 본인 attempt 생성).
 * TODO(Phase 3): 하루 도전 횟수 확인. TODO(Phase 2): 세트 재사용.
 */
export async function createMatch(ctx: Ctx, category: Category): Promise<{ matchId: string; shareCode: string }> {
  const rules = rulesOf(ctx);
  const now = nowOf(ctx);

  const userSnap = await ctx.db.collection("users").doc(ctx.uid).get();
  const nickname = userSnap.get("nickname");
  if (typeof nickname !== "string" || !nickname) {
    throw new HttpsError("failed-precondition", "닉네임을 먼저 설정해 주세요.");
  }

  const pool = await loadPool(ctx.db, category);
  if (pool.length < rules.questionsPerMatch) {
    throw new HttpsError("failed-precondition", `출제 가능한 문항이 부족합니다: ${category}`);
  }
  const qids = pickRandom(pool, rules.questionsPerMatch);

  const setRef = ctx.db.collection("questionSets").doc();
  const matchRef = ctx.db.collection("matches").doc();
  const shareCode = newShareCode();
  const createdAt = Timestamp.fromMillis(now);

  const match: MatchDoc = {
    setId: setRef.id,
    category,
    type: "friend",
    challenger: { uid: ctx.uid, nickname },
    opponent: {},
    status: "waiting",
    winnerUid: null,
    createdAt,
    expiresAt: Timestamp.fromMillis(now + rules.matchExpiryHours * 3_600_000),
    shareCode,
  };
  const attempt: AttemptDoc = {
    matchId: matchRef.id,
    setId: setRef.id,
    qids,
    answers: [],
    score: 0,
    finishedAt: null,
  };

  const batch = ctx.db.batch();
  batch.set(setRef, { category, questionIds: qids, createdAt });
  batch.set(matchRef, match);
  batch.set(matchRef.collection("attempts").doc(ctx.uid), attempt);
  await batch.commit();

  return { matchId: matchRef.id, shareCode };
}

/**
 * 현재 문항 내려주기. 첫 문항 시작과 이어하기용.
 * - 아직 내려가지 않은 다음 문항이면 servedAt을 지금으로 기록한다.
 * - 이미 내려간 문항을 다시 요청하면 servedAt을 바꾸지 않는다 (부정행위 방지 3).
 * - 답한 문항이나 건너뛴 문항은 요청할 수 없다.
 */
export async function getQuestion(ctx: Ctx, matchId: string, index: number): Promise<QuestionPayload> {
  const ref = attemptRef(ctx, matchId);
  const now = nowOf(ctx);

  const attempt = await ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "참가하지 않은 대결입니다.");
    const a = snap.data() as AttemptDoc;
    if (a.finishedAt) throw new HttpsError("failed-precondition", "이미 끝난 대결입니다.");
    if (!Number.isInteger(index) || index < 0 || index >= a.qids.length) {
      throw new HttpsError("invalid-argument", "문항 번호가 올바르지 않습니다.");
    }

    const existing = a.answers[index];
    if (existing) {
      if (existing.answeredAt) throw new HttpsError("failed-precondition", "이미 답한 문항입니다.");
      return a; // 재요청: servedAt 유지
    }
    if (index !== a.answers.length) {
      throw new HttpsError("failed-precondition", "앞 문항을 먼저 풀어야 합니다.");
    }
    a.answers.push({ qid: a.qids[index], servedAt: Timestamp.fromMillis(now) });
    tx.update(ref, { answers: a.answers });
    return a;
  });

  return buildPayload(ctx, attempt, index, now);
}

/**
 * 답 제출 → 서버 시간으로 채점 → 저장. 응답에 다음 문항을 함께 싣는다.
 * choice = null 은 시간 초과(무응답).
 */
export async function submitAnswer(
  ctx: Ctx,
  matchId: string,
  index: number,
  choice: number | null,
): Promise<AnswerResult> {
  const rules = rulesOf(ctx);
  if (choice !== null && (!Number.isInteger(choice) || choice < 0 || choice >= rules.choicesPerQuestion)) {
    throw new HttpsError("invalid-argument", "보기 번호가 올바르지 않습니다.");
  }
  const ref = attemptRef(ctx, matchId);
  const now = nowOf(ctx);

  const { attempt, question, record } = await ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "참가하지 않은 대결입니다.");
    const a = snap.data() as AttemptDoc;
    if (a.finishedAt) throw new HttpsError("failed-precondition", "이미 끝난 대결입니다.");

    const current = a.answers[index];
    if (!current || index !== a.answers.length - 1) {
      throw new HttpsError("failed-precondition", "받지 않은 문항입니다.");
    }
    if (current.answeredAt) throw new HttpsError("failed-precondition", "이미 답한 문항입니다.");

    const q = await loadQuestion(ctx.db, current.qid);
    const elapsedMs = Math.max(0, now - current.servedAt.toMillis());
    const scored = scoreAnswer(choice, q.answerIndex, elapsedMs, rules);

    const done: AnswerRecord = {
      ...current,
      answeredAt: Timestamp.fromMillis(now),
      choice,
      correct: scored.correct,
      points: scored.points,
      elapsedMs,
    };
    a.answers[index] = done;
    a.score += scored.points;

    // 다음 문항을 미리 배정. 정답 공개 시간만큼 시작을 늦춰 그동안 타이머가 흐르지 않게 한다.
    if (index + 1 < a.qids.length) {
      a.answers.push({
        qid: a.qids[index + 1],
        servedAt: Timestamp.fromMillis(now + rules.answerRevealMs),
      });
    }
    tx.update(ref, { answers: a.answers, score: a.score });
    return { attempt: a, question: q, record: done };
  });

  const nextIndex = index + 1;
  const next = nextIndex < attempt.qids.length ? await buildPayload(ctx, attempt, nextIndex, now) : null;

  return {
    correct: record.correct === true,
    points: record.points ?? 0,
    answerIndex: question.answerIndex,
    explanation: question.explanation,
    totalScore: attempt.score,
    next,
  };
}

/**
 * 총점 확정. 답하지 않은 문항은 시간 초과(0점, 제한시간만큼 소요)로 처리한다.
 * 양쪽이 모두 끝났으면 승패를 판정하고 전적을 갱신한다.
 * TODO(Phase 2): 상대에게 푸시 발송.
 */
export async function finishMatch(ctx: Ctx, matchId: string): Promise<FinishResult> {
  const rules = rulesOf(ctx);
  const now = nowOf(ctx);
  const matchRef = ctx.db.collection("matches").doc(matchId);
  const ref = attemptRef(ctx, matchId);

  return ctx.db.runTransaction(async (tx) => {
    const [mSnap, aSnap] = await Promise.all([tx.get(matchRef), tx.get(ref)]);
    if (!mSnap.exists || !aSnap.exists) throw new HttpsError("not-found", "참가하지 않은 대결입니다.");
    const match = mSnap.data() as MatchDoc;
    const a = aSnap.data() as AttemptDoc;

    const role = match.challenger.uid === ctx.uid ? "challenger" : match.opponent.uid === ctx.uid ? "opponent" : null;
    if (!role) throw new HttpsError("permission-denied", "참가하지 않은 대결입니다.");

    const results = a.qids.map((_, i) => {
      const r = a.answers[i];
      return r?.answeredAt ? { correct: r.correct === true, points: r.points ?? 0 } : { correct: false, points: 0 };
    });
    const score = results.reduce((sum, r) => sum + r.points, 0);
    const timeMs = a.qids.reduce((sum, _, i) => {
      const r = a.answers[i];
      return sum + (r?.answeredAt ? Math.min(r.elapsedMs ?? 0, rules.timeLimitMs) : rules.timeLimitMs);
    }, 0);

    const other = role === "challenger" ? match.opponent : match.challenger;
    const alreadyFinished = a.finishedAt !== null;

    let status = match.status;
    let winnerUid = match.winnerUid;

    if (!alreadyFinished) {
      const finishedAt = Timestamp.fromMillis(now);
      tx.update(ref, { finishedAt, score });

      const update: Record<string, unknown> = {
        [`${role}.score`]: score,
        [`${role}.timeMs`]: timeMs,
        [`${role}.finishedAt`]: finishedAt,
      };
      // 같은 사용자 문서에 한 번만 쓰도록 모아서 기록
      const stats = new Map<string, Record<string, FieldValue>>([[ctx.uid, { played: FieldValue.increment(1) }]]);

      if (other.uid && other.finishedAt && typeof other.score === "number" && typeof other.timeMs === "number") {
        winnerUid = decideWinner({ uid: ctx.uid, score, timeMs }, { uid: other.uid, score: other.score, timeMs: other.timeMs });
        status = "done";
        update.status = status;
        update.winnerUid = winnerUid;
        if (winnerUid) {
          const loserUid = winnerUid === ctx.uid ? other.uid : ctx.uid;
          stats.set(winnerUid, { ...stats.get(winnerUid), won: FieldValue.increment(1) });
          stats.set(loserUid, { ...stats.get(loserUid), lost: FieldValue.increment(1) });
        }
      }
      tx.update(matchRef, update);
      for (const [uid, s] of stats) {
        tx.set(ctx.db.collection("users").doc(uid), { stats: s }, { merge: true });
      }
    }

    return {
      matchId,
      score,
      timeMs,
      correctCount: results.filter((r) => r.correct).length,
      results,
      status,
      winnerUid,
      opponent: other.uid ? { nickname: other.nickname, score: other.finishedAt ? other.score : undefined } : null,
    };
  });
}
