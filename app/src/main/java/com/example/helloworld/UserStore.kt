package com.example.helloworld

import android.content.Context
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Minimal local credential store for demo purposes.
 * Passwords are stored as salted SHA-256 hashes in SharedPreferences.
 * This is NOT production-grade auth — use a real backend for production.
 */
class UserStore(context: Context) {

    private val prefs = context.getSharedPreferences("users", Context.MODE_PRIVATE)

    fun userExists(email: String): Boolean =
        prefs.contains("user_${email.lowercase()}_hash")

    fun register(name: String, email: String, password: String): Boolean {
        val key = email.lowercase()
        if (userExists(key)) return false
        val salt = newSalt()
        prefs.edit()
            .putString("user_${key}_name", name)
            .putString("user_${key}_salt", salt)
            .putString("user_${key}_hash", hash(password, salt))
            .apply()
        return true
    }

    fun validate(email: String, password: String): Boolean {
        val key = email.lowercase()
        val salt = prefs.getString("user_${key}_salt", null) ?: return false
        val stored = prefs.getString("user_${key}_hash", null) ?: return false
        return stored == hash(password, salt)
    }

    fun nameFor(email: String): String? =
        prefs.getString("user_${email.lowercase()}_name", null)

    private fun newSalt(): String {
        val bytes = ByteArray(16)
        SecureRandom().nextBytes(bytes)
        return bytes.toHex()
    }

    private fun hash(password: String, salt: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        md.update(salt.toByteArray())
        return md.digest(password.toByteArray()).toHex()
    }

    private fun ByteArray.toHex(): String =
        joinToString("") { "%02x".format(it) }
}
