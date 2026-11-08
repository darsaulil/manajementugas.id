# Database schema, migration, dan seed

Database utama adalah PostgreSQL Neon eksternal. Migration `001_initial_schema.sql` membuat schema aplikasi secara additive setelah pemeriksaan awal memastikan schema `public` tidak memiliki tabel atau view.

## Tabel dan kebijakan

| Tabel | Tujuan | Kebijakan penghapusan |
|---|---|---|
| `users` | Akun Owner/User, status aktif, hash password, verifikasi | Tidak dihapus melalui migration; task memakai `ON DELETE RESTRICT` agar data tidak hilang tanpa sengaja |
| `tasks` | Tugas milik tepat satu user | `owner_id` wajib valid dan `ON DELETE RESTRICT` |
| `email_verification_tokens` | Hash token verifikasi dan masa berlaku | `ON DELETE CASCADE` saat user dihapus |
| `password_reset_tokens` | Hash token reset password dan masa berlaku | `ON DELETE CASCADE` saat user dihapus |
| `sessions` | Hash identifier session dan expiry | `ON DELETE CASCADE` saat user dihapus |
| `schema_migrations` | Versi dan checksum migration yang telah diterapkan | Dikelola oleh migration runner |

`users.email` boleh kosong sejak migration `003_optional_email.sql`; nilai yang diisi memiliki unique index berdasarkan `LOWER(email)`. `users.login_id` memiliki unique constraint dan check format. `users.nickname` ditambahkan secara additive melalui migration `002_nickname.sql`, di-backfill dari `login_id` untuk akun existing, diwajibkan 2–80 karakter, dan memiliki unique index case-insensitive. Role dibatasi pada `owner` dan `user`. Jenis tugas dibatasi pada `biasa`, `ribet`, dan `prioritas`. Status tugas dibatasi pada `pending` dan `completed`, dengan check agar `completed_at` konsisten dengan status.

### Kepemilikan dan keamanan

`tasks.owner_id` adalah foreign key yang tidak nullable, sehingga setiap tugas selalu memiliki pemilik valid. Query aplikasi pada tahap berikutnya wajib selalu membatasi `owner_id` dari session backend, bukan dari input frontend.

Password disimpan sebagai hash scrypt dengan salt acak dan parameter yang disimpan di format hash. Token email, reset password, dan session hanya menyediakan kolom hash, bukan token mentah. Migration `001` dan `002` tidak membuat akun atau tugas; migration `002` hanya mengisi nickname kosong pada baris users yang sudah ada. Database Development saat finalisasi memiliki tepat 1 Owner, 5 User, dan 15 task. Pool PostgreSQL memverifikasi sertifikat Neon dengan `sslmode=verify-full`.

### Asumsi yang direkomendasikan

Format `login_id` direkomendasikan lowercase, 3–32 karakter, dimulai alfanumerik, dan dapat berisi `.`, `_`, atau `-`. Zona waktu disimpan sebagai `TIMESTAMPTZ`; aturan tampilan zona waktu dan rumus laporan ditunda ke tahap autentikasi/dashboard. Akun dinonaktifkan dengan `is_active = false` dan `deactivated_at` terisi; data tidak dihapus.
