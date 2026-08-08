package com.example.helloworld

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.credentials.CredentialManager
import androidx.credentials.ClearCredentialStateRequest
import com.example.helloworld.databinding.ActivityHomeBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding
    private lateinit var session: Session

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)
        session = Session(this)

        val label = session.name?.takeIf { it.isNotBlank() } ?: session.email ?: "there"
        binding.tvUser.text = "Signed in as $label"

        binding.btnLogout.setOnClickListener { doLogout() }
    }

    private fun doLogout() {
        val wasGoogle = session.provider == "google"
        session.signOut()
        if (wasGoogle) {
            CoroutineScope(Dispatchers.IO).launch {
                runCatching {
                    CredentialManager.create(this@HomeActivity)
                        .clearCredentialState(ClearCredentialStateRequest())
                }
            }
        }
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }
}
