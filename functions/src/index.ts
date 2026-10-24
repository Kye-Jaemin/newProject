import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import { isCategory } from "./config";
import * as game from "./game/matchService";

initializeApp();

// 서울 리전. 비용 폭주 방지를 위해 인스턴스 상한을 둔다 (지도서 12장 "서버비 급증").
// concurrency 기본값(80)으로 한 인스턴스가 여러 요청을 처리해 문항 캐시가 공유된다.
setGlobalOptions({ region: "asia-northeast3", maxInstances: 10, memory: "256MiB" });

function ctxOf(request: CallableRequest): game.Ctx {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  return { db: getFirestore(), uid: request.auth.uid };
}

function str(data: unknown, key: string): string {
  const v = (data as Record<string, unknown> | null)?.[key];
  if (typeof v !== "string" || !v || v.length > 64) throw new HttpsError("invalid-argument", `${key}가 필요합니다.`);
  return v;
}

function int(data: unknown, key: string): number {
  const v = (data as Record<string, unknown> | null)?.[key];
  if (!Number.isInteger(v)) throw new HttpsError("invalid-argument", `${key}는 정수여야 합니다.`);
  return v as number;
}

/** Phase 0 연결 확인용 */
export const whoami = onCall((request) => {
  const { uid } = ctxOf(request);
  return {
    uid,
    anonymous: request.auth?.token.firebase?.sign_in_provider === "anonymous",
  };
});

export const createMatch = onCall((request) => {
  const category = (request.data as Record<string, unknown> | null)?.category;
  if (!isCategory(category)) throw new HttpsError("invalid-argument", "카테고리가 올바르지 않습니다.");
  return game.createMatch(ctxOf(request), category);
});

export const getQuestion = onCall((request) =>
  game.getQuestion(ctxOf(request), str(request.data, "matchId"), int(request.data, "index")),
);

export const submitAnswer = onCall((request) => {
  const raw = (request.data as Record<string, unknown> | null)?.choice;
  const choice = raw === null || raw === undefined ? null : int(request.data, "choice");
  return game.submitAnswer(ctxOf(request), str(request.data, "matchId"), int(request.data, "index"), choice);
});

export const finishMatch = onCall((request) => game.finishMatch(ctxOf(request), str(request.data, "matchId")));
