# ManajemenTugas.id

Fondasi teknis, shell frontend publik, autentikasi, dan pengelolaan tugas nyata untuk ManajemenTugas.id. Stack tetap Node.js + Express, PostgreSQL Neon melalui `pg`, serta HTML/CSS/Vanilla JavaScript.

## Stack

- Node.js 22+
- Express.js
- PostgreSQL Neon melalui package `pg`
- HTML5, CSS3, dan Vanilla JavaScript
- `helmet` untuk security headers
- `express-rate-limit` untuk rate limiting endpoint sensitif
- `nodemailer` untuk provider SMTP opsional

## Menjalankan secara lokal

1. Salin `.env.example` menjadi `.env` hanya untuk environment lokal.
2. Isi `DATABASE_URL` dan `SESSION_SECRET` secara privat. `SESSION_SECRET` harus memiliki minimal 32 karakter.
3. Pasang dependency dengan `npm install`.
4. Jalankan server HTTP lokal dengan `npm run dev` atau `npm start`.
5. Periksa `GET /api/health`, `/login`, dan `/register`.

Pada Webdev, `DATABASE_URL` dan `SESSION_SECRET` Development disediakan melalui protected secret platform dan tidak disimpan dalam workspace, source code, Git, atau log.

Panduan lengkap setup VS Code, environment lokal, Neon, migration, dan pengujian tersedia di [`docs/local-development.md`](docs/local-development.md). Kontrol keamanan dan hasil audit dirangkum di [`docs/security.md`](docs/security.md) dan [`docs/final-audit.md`](docs/final-audit.md).

Untuk Cloud Preview HTTPS, jalankan:

```bash
npm run preview
```

Script ini secara eksplisit menetapkan `COOKIE_SECURE=true` dan `COOKIE_SAMESITE=none`. Jangan menentukan atribut tersebut dari `NODE_ENV` atau `req.secure`. Untuk HTTP lokal, gunakan `COOKIE_SECURE=false` dan `COOKIE_SAMESITE=lax` seperti pada `.env.example`.

## Database development

Migration dan seed dilakukan melalui perintah eksplisit setelah `DATABASE_URL` Development tersedia:

```bash
npm run db:migrate
SEED_ENABLED=true SEED_OWNER_PASSWORD='password-development' SEED_USER_PASSWORD='password-development' npm run db:seed
```

Seed menolak environment selain `development`, tidak mencetak password atau connection string, dan menggunakan hash scrypt. Detail schema tersedia di `docs/database-schema.md`; akun dummy development tersedia di `docs/development-accounts.md`.

## Authentication API

Registrasi publik selalu membuat role `user`; field `role` dari request diabaikan. Login menentukan role dari database dan mengembalikan redirect tetap berdasarkan role.

| Method | Endpoint | Perlindungan | Fungsi |
|---|---|---|---|
| `POST` | `/api/auth/register` | Rate limit | Registrasi User, hash password, membuat session, dan mengembalikan redirect dashboard |
| `POST` | `/api/auth/login` | Rate limit | Verifikasi ID/password dan status akun, lalu membuat session |
| `POST` | `/api/auth/logout` | CSRF + session | Menghapus session server-side dan cookie |
| `GET` | `/api/auth/me` | Session | Mengembalikan identitas dan role dari session |
| `GET` | `/api/auth/csrf` | Session | Mengembalikan CSRF token non-HttpOnly untuk client terautentikasi |
| `GET` | `/api/auth/verify-email?token=...` | Token sekali pakai | Memverifikasi email dan menginvalidasi token |
| `POST` | `/api/auth/forgot-password` | Rate limit | Membuat token reset dengan respons generik |
| `POST` | `/api/auth/reset-password` | Rate limit + token | Mengganti password, memakai token sekali, menghapus session lama |
| `GET` | `/api/user/access-check` | User session | Endpoint pemeriksaan akses role User |
| `GET` | `/api/owner/access-check` | Owner session | Endpoint pemeriksaan akses role Owner |

Halaman publik tersedia pada `/login`, `/register`, `/forgot-password`, `/reset-password`, dan `/verify-email`. Registrasi berhasil langsung membuat session dan mengarahkan User ke `/dashboard`. Login berikutnya mengarahkan User ke `/dashboard` dan Owner ke `/owner/dashboard`. Kedua route tersebut protected dan memuat dashboard tugas nyata sesuai scope role.

Session disimpan pada tabel PostgreSQL `sessions`, bukan MemoryStore. Cookie session bernama `mt_session`, HttpOnly, dan cookie CSRF bernama `mt_csrf` tidak HttpOnly agar dapat dikirim sebagai header `X-CSRF-Token`. Password dan token tidak disimpan di `localStorage`.

## Task API dan dashboard

Dashboard `/dashboard` untuk User dan `/owner/dashboard` untuk Owner sekarang memuat data tugas nyata dari PostgreSQL. Profil juga memiliki nickname unik yang dapat diubah melalui Settings; login ID, role, dan ownership task tidak berubah. Endpoint lengkap dan aturan ownership tersedia di [`docs/tasks-api.md`](docs/tasks-api.md). Endpoint utamanya adalah `GET /api/tasks`, `GET /api/tasks/summary`, `GET /api/tasks/:id`, `POST /api/tasks`, `PATCH /api/tasks/:id`, `PATCH /api/tasks/:id/status`, dan `DELETE /api/tasks/:id`.

User hanya dapat melihat dan mengelola tugas miliknya. Owner dapat melihat dan mengelola seluruh tugas melalui scope server-side. Semua mutasi memerlukan CSRF token. Pencarian, filter jenis/status/deadline, penanda urgent/overdue, form tambah/edit, toggle status, konfirmasi delete, loading, empty, success, dan error state memakai data API nyata. Preview dashboard pada landing page tetap ilustrasi dan tidak berubah menjadi data akun.

Dashboard Owner menggunakan `/api/owner/overview`, `/api/owner/users`, `GET /api/owner/users/:userId`, dan `PATCH /api/owner/users/:userId/status` untuk agregasi, pencarian akun, detail pengguna, serta aktivasi/nonaktif. Akun nonaktif kehilangan session aktif tetapi task tetap dipertahankan. Owner terakhir dan self-deactivation dilindungi server-side.

Laporan User/Owner tersedia di `/reports` dan `GET /api/reports` dengan mode `daily` atau `monthly`. Detail snapshot, UTC, rumus periode, denominator nol, dan keputusan penugasan yang ditunda ada di [`docs/reports.md`](docs/reports.md). Pengaturan akun tersedia di `/settings` dengan endpoint profil, perubahan password, dan perubahan email yang memerlukan verifikasi ulang.

## Email provider

Mode email dikendalikan oleh `EMAIL_MODE`:

- `disabled`: default aman jika provider belum dikonfigurasi; tidak mengklaim email terkirim.
- `simulation`: mode simulasi eksplisit tanpa pengiriman email dan tanpa mencetak token.
- `test`: hanya digunakan oleh `npm test` untuk menangkap token secara in-memory tanpa mengirim email.
- `smtp`: mengirim melalui `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, dan `APP_BASE_URL`.

`SMTP_PASSWORD` harus disediakan melalui protected secret atau environment secret deployment, bukan melalui source code, Git, atau chat. Saat provider belum tersedia, akun/token database tetap mengikuti alur server tetapi email sungguhan belum dikirim; laporan tidak mengklaim email terkirim.

## Pengujian

```bash
npm run check
npm test
npm audit
```

`npm test` memakai `EMAIL_MODE=test` dan database Development. Test aktual mencakup:

- Registrasi User berhasil dan role Owner dari request ditolak.
- ID/email duplikat ditolak.
- Password tersimpan sebagai hash scrypt.
- Login benar/salah dan email belum terverifikasi.
- Redirect role Owner/User.
- Anonymous ditolak dari endpoint privat.
- User ditolak dari endpoint Owner.
- Session rotation mencegah session fixation.
- Logout dan CSRF.
- Akun nonaktif menolak session lama.
- Token verifikasi/reset sekali pakai dan token reset kedaluwarsa.
- Reset password menghapus session lama.
- Rate limiting.
- CRUD tugas User dan Owner, ownership isolation, CSRF mutation, search, filters, summary, urgent/overdue, status persistence, dan delete.
- Dashboard Owner, agregasi pengguna/tugas, filter akun, detail user, deactivation session, dan perlindungan Owner terakhir.
- Laporan harian/bulanan User dan Owner, snapshot repeatable-read, trend buckets, perbandingan pengguna, dan denominator nol.
- Pengaturan profil, nickname unik, password saat ini/password baru, session rotation, email unik dengan token verifikasi ulang, dan preferensi tema.
- Schema/seed database dan health/404 foundation.

Pada pengujian aktual terakhir: test read-only lulus dan test mutatif dilewati bila `TEST_DATABASE_URL` terisolasi belum disediakan. Runner tidak pernah membuat akun/task tambahan pada database proyek utama. `npm run check` juga berhasil. Audit dependency dijalankan pada finalisasi dan hasil aktualnya harus dibaca bersama laporan final; pool menormalkan mode SSL legacy ke `sslmode=verify-full`, sehingga sertifikat Neon diverifikasi terhadap hostname dan warning TLS legacy tidak lagi menjadi konfigurasi runtime yang dipakai.

## Status tahapan

- Tahap 4.1 — Fondasi Teknis: selesai.
- Tahap 4.2 — Design System dan Shell Frontend: selesai.
- Tahap 4.3 — Schema, Migration, dan Seed: selesai.
- Tahap 4.4 — Autentikasi dan Keamanan: selesai sesuai ruang lingkup tahap ini.
- Tahap 4.5 — CRUD Tugas, REST API, Audit, dan Perbaikan Fondasi: selesai sesuai ruang lingkup tahap ini.
- Tahap 4.6 — Dashboard Lengkap, Laporan, Pengaturan Akun, dan Audit: selesai sesuai ruang lingkup tahap ini.

## Belum dikerjakan

Penugasan tugas Owner ke akun lain masih ditunda karena aturan pemilik/pembuat/pengubah belum ditetapkan. Integrasi provider email production belum dikonfigurasi dan deployment ke Vercel belum dilakukan.
