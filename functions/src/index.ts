import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

// 서울 리전. 비용 폭주 방지를 위해 인스턴스 상한을 둔다 (지도서 12장 "서버비 급증").
setGlobalOptions({ region: "asia-northeast3", maxInstances: 10 });

/**
 * Phase 0 연결 확인용. 앱이 익명 로그인 후 호출해 uid가 서버까지 전달되는지 본다.
 * Phase 1 API(getQuestion / submitAnswer / finishMatch)가 들어오면 제거한다.
 */
export const whoami = onCall((request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  return {
    uid: request.auth.uid,
    anonymous: request.auth.token.firebase?.sign_in_provider === "anonymous",
  };
});
