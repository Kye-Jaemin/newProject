package com.quizduel.app.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

/** F1 익명 시작: 회원가입 없이 Firebase 익명 계정으로 바로 플레이한다. */
@Singleton
class AuthRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val functions: FirebaseFunctions,
) {
    /** 이미 로그인돼 있으면 그 uid, 아니면 익명 로그인 후 uid. */
    suspend fun ensureSignedIn(): String {
        auth.currentUser?.let { return it.uid }
        val result = auth.signInAnonymously().await()
        return requireNotNull(result.user).uid
    }

    /** 서버(Functions)가 이 기기의 로그인 정보를 받는지 확인한다. 서버가 본 uid를 돌려준다. */
    suspend fun verifyWithServer(): String {
        val data = functions.getHttpsCallable("whoami").call().await().getData()
        return (data as Map<*, *>)["uid"] as String
    }
}
