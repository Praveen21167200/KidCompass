package com.example.helloworld

import android.content.Intent
import android.os.Bundle
import android.util.Patterns
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.example.helloworld.databinding.ActivitySignupBinding

class SignupActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySignupBinding
    private lateinit var users: UserStore
    private lateinit var session: Session

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySignupBinding.inflate(layoutInflater)
        setContentView(binding.root)
        users = UserStore(this)
        session = Session(this)

        binding.btnSignup.setOnClickListener { doSignup() }
        binding.tvGoToLogin.setOnClickListener { finish() }
    }

    private fun doSignup() {
        val name = binding.etName.text?.toString()?.trim().orEmpty()
        val email = binding.etEmail.text?.toString()?.trim().orEmpty()
        val password = binding.etPassword.text?.toString().orEmpty()
        val confirm = binding.etConfirm.text?.toString().orEmpty()

        binding.tilName.error = null
        binding.tilEmail.error = null
        binding.tilPassword.error = null
        binding.tilConfirm.error = null

        if (name.isEmpty()) {
            binding.tilName.error = "Enter your name"
            return
        }
        if (!Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            binding.tilEmail.error = "Enter a valid email"
            return
        }
        if (password.length < 6) {
            binding.tilPassword.error = "At least 6 characters"
            return
        }
        if (password != confirm) {
            binding.tilConfirm.error = "Passwords do not match"
            return
        }
        if (!users.register(name, email, password)) {
            binding.tilEmail.error = "Account already exists"
            return
        }

        session.signIn(email, name, "password")
        Toast.makeText(this, "Account created", Toast.LENGTH_SHORT).show()
        startActivity(Intent(this, HomeActivity::class.java))
        finishAffinity()
    }
}
