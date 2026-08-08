package com.example.helloworld

import android.content.Context

/** Tracks the currently signed-in user. */
class Session(context: Context) {

    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    var isLoggedIn: Boolean
        get() = prefs.getBoolean("logged_in", false)
        private set(value) = prefs.edit().putBoolean("logged_in", value).apply()

    val email: String? get() = prefs.getString("email", null)
    val name: String? get() = prefs.getString("name", null)
    val provider: String? get() = prefs.getString("provider", null)

    fun signIn(email: String, name: String?, provider: String) {
        prefs.edit()
            .putBoolean("logged_in", true)
            .putString("email", email)
            .putString("name", name)
            .putString("provider", provider)
            .apply()
    }

    fun signOut() {
        prefs.edit().clear().apply()
    }
}
