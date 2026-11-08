# Akun dummy development

Akun berikut hanya untuk development dan pengujian lokal/Neon Development. Jangan gunakan password ini pada production dan jangan menjalankan seed pada production.

| Role | Login ID | Email | Password seed |
|---|---|---|---|
| Owner | `owner-demo` | `owner-demo@example.com` | `OwnerDemo!2026` |
| User | `user-demo-01` | `user-demo-01@example.com` | `UserDemo!2026` |
| User | `user-demo-02` | `user-demo-02@example.com` | `UserDemo!2026` |
| User | `user-demo-03` | `user-demo-03@example.com` | `UserDemo!2026` |
| User | `user-demo-04` | `user-demo-04@example.com` | `UserDemo!2026` |
| User | `user-demo-05` | `user-demo-05@example.com` | `UserDemo!2026` |

Seed tidak mencetak password maupun connection string ke log. Password hanya diberikan ke proses seed melalui `SEED_OWNER_PASSWORD` dan `SEED_USER_PASSWORD`, lalu disimpan sebagai hash scrypt.
