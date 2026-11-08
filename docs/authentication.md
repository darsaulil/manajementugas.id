# Autentikasi dan keamanan — Tahap 4.4

## Model session

Aplikasi menggunakan session server-side pada PostgreSQL melalui tabel `sessions`. Browser menerima:

- `mt_session`: token acak, disimpan HttpOnly, hanya hash SHA-256 yang disimpan di database.
- `mt_csrf`: HMAC token yang berasal dari session token, tidak HttpOnly, dikirim kembali sebagai `X-CSRF-Token` untuk request mutasi yang membutuhkan CSRF.

Login membuat session baru setelah password diverifikasi dan menghapus session cookie lama terlebih dahulu. Logout menghapus row session dan menghapus kedua cookie. Setiap request privat menggabungkan session dengan `users` dan menolak session yang kedaluwarsa atau akun yang sudah `is_active = false`.

Untuk Cloud Preview HTTPS, gunakan `COOKIE_SECURE=true` dan `COOKIE_SAMESITE=none`. Untuk HTTP lokal, gunakan `COOKIE_SECURE=false` dan `COOKIE_SAMESITE=lax`. Konfigurasi ditentukan melalui environment eksplisit, bukan `NODE_ENV` atau `req.secure`.

## Validasi dan password

`login_id` dinormalisasi lowercase dan mengikuti format 3–32 karakter alfanumerik dengan `.`, `_`, atau `-`. Setiap akun memiliki `nickname` unik case-insensitive sepanjang 2–80 karakter; akun existing memperoleh nickname dari `login_id` melalui migration additive. Nickname dapat diubah dari Settings tanpa mengubah login ID, role, atau ownership task. Email dinormalisasi lowercase dan divalidasi. Password minimal 12 dan maksimal 128 karakter serta wajib memiliki huruf besar, huruf kecil, angka, dan simbol.

Password memakai format scrypt yang sama dengan seed Tahap 4.3. Tidak ada password mentah dalam response, cookie, localStorage, database, atau log.

Registrasi publik menyimpan user dengan email yang diberikan (email boleh kosong) dan langsung membuat session User. Response registrasi menyertakan `redirectPath: "/dashboard"` sehingga browser dapat berpindah ke dashboard tanpa melakukan request login kedua. Login setelah registrasi memakai ID dan password yang sama melalui endpoint `/api/auth/login`.

## Otorisasi

Role selalu dibaca dari join session/database. Request frontend tidak dapat memilih role. Endpoint pemeriksaan role:

- `GET /api/user/access-check` hanya role `user`.
- `GET /api/owner/access-check` hanya role `owner`.
- `GET /dashboard` hanya session User dan menyajikan task workspace User.
- `GET /owner/dashboard` hanya session Owner dan menyajikan task workspace Owner.

Route dashboard memuat data tugas nyata sesuai scope role. Preview dashboard pada landing tetap terpisah dan tidak membaca data database.

## Token email dan reset

Token verifikasi email berlaku 24 jam; token reset password berlaku 1 jam. Database hanya menyimpan hash SHA-256 token. Setelah digunakan, token diberi `used_at` dan tidak dapat dipakai lagi. Reset password juga menghapus seluruh session user tersebut.

Jika provider email belum dikonfigurasi, API memberi status `not_configured` atau `simulation` dan tidak mengklaim email terkirim. Mode `test` menangkap token hanya dalam memory test process agar pengujian token dapat dilakukan tanpa mengirim email.

## Environment

| Variable | Wajib | Keterangan |
|---|---:|---|
| `DATABASE_URL` | Ya | Protected Neon PostgreSQL DSN |
| `SESSION_SECRET` | Ya | Protected secret minimal 32 karakter untuk CSRF/session binding |
| `COOKIE_SECURE` | Ya untuk deployment | `true` pada HTTPS Preview/production; `false` HTTP lokal |
| `COOKIE_SAMESITE` | Ya untuk deployment | `none` pada embedded HTTPS Preview; `lax` lokal |
| `EMAIL_MODE` | Tidak | `disabled`, `simulation`, `test`, atau `smtp` |
| `APP_BASE_URL` | Untuk email | Base URL untuk tautan verifikasi/reset |
| `EMAIL_FROM` | SMTP | Sender email |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` | SMTP | Konfigurasi SMTP |
| `SMTP_PASSWORD` | SMTP | Protected secret, tidak boleh di Git/chat |

`SESSION_SECRET` Development sudah disimpan melalui protected secret resmi Webdev. Kredensial SMTP belum tersedia dan belum diminta karena pengujian tahap ini menggunakan `EMAIL_MODE=test` tanpa email nyata.

## Pengaturan akun Tahap 4.6

- `GET /api/account/me` mengembalikan profil non-rahasia dan status verifikasi.
- `POST /api/account/password` memerlukan password saat ini, memvalidasi password baru, menghapus session lain, dan merotasi session browser aktif.
- `POST /api/account/email` memerlukan password saat ini, memvalidasi keunikan email, mengatur email baru menjadi belum terverifikasi, dan mengirim token verifikasi satu kali melalui provider existing.
- `POST /api/account/nickname` memerlukan session dan CSRF, memvalidasi panjang/karakter/keunikan nickname, lalu memperbarui nickname tanpa mengubah login ID.

Role tidak dapat diubah melalui pengaturan. Tema hanya disimpan sebagai preferensi lokal design system.

## Administrasi Owner Tahap 4.6

- `GET /api/owner/overview` dan `GET /api/owner/users/:userId` hanya dapat diakses role Owner.
- `PATCH /api/owner/users/:userId/status` membutuhkan CSRF, mencabut session saat akun dinonaktifkan, dan mempertahankan data task.
- Owner terakhir dilindungi dengan advisory transaction lock; penghapusan permanen pengguna tidak tersedia.
