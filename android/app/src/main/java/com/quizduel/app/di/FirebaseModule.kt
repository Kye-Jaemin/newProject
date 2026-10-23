package com.quizduel.app.di

import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.firestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.functions
import com.quizduel.app.BuildConfig
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/** Functions 배포 리전. functions/src/index.ts 의 setGlobalOptions 와 같아야 한다. */
private const val FUNCTIONS_REGION = "asia-northeast3"

@Module
@InstallIn(SingletonComponent::class)
object FirebaseModule {

    @Provides
    @Singleton
    fun provideAuth(): FirebaseAuth = Firebase.auth.apply {
        if (BuildConfig.USE_EMULATOR) useEmulator(BuildConfig.EMULATOR_HOST, 9099)
    }

    @Provides
    @Singleton
    fun provideFirestore(): FirebaseFirestore = Firebase.firestore.apply {
        if (BuildConfig.USE_EMULATOR) useEmulator(BuildConfig.EMULATOR_HOST, 8080)
    }

    @Provides
    @Singleton
    fun provideFunctions(): FirebaseFunctions = Firebase.functions(FUNCTIONS_REGION).apply {
        if (BuildConfig.USE_EMULATOR) useEmulator(BuildConfig.EMULATOR_HOST, 5001)
    }
}
