# Asumsi dan keputusan yang ditunda

## Keputusan yang digunakan pada Tahap 4.1

- Runtime utama adalah Node.js dengan Express.
- Database eksternal adalah PostgreSQL Neon melalui `pg`.
- `DATABASE_URL` dibaca dari environment dan tidak pernah ditulis ke source code.
- Webdev menggunakan `server: true` dan `database: false`.
- Port default adalah `3000`; server bind ke `0.0.0.0` agar dapat diakses Cloud Preview.
- Health check hanya menjalankan `SELECT 1` dan tidak menampilkan nama database, host, atau credential.
- `public/manus-routes.json` mendeklarasikan landing, halaman auth, dan protected redirect placeholder; endpoint API tidak dimasukkan.
- Graceful shutdown menutup HTTP server dan connection pool PostgreSQL.

## Catatan validasi

Pengujian aktual dengan `pg` berhasil terhubung ke Neon. Pada final audit, pool menormalkan `sslmode=prefer`, `require`, atau `verify-ca` menjadi `sslmode=verify-full`, dan `.env.example` menggunakan `verify-full`. Dengan demikian sertifikat diverifikasi terhadap hostname database; keamanan tidak diturunkan hanya untuk menghilangkan warning driver. Secret `DATABASE_URL` asli tetap hanya berada di protected environment.

Pada Tahap 4.3, pemeriksaan read-only awal menemukan schema `public` tanpa tabel/view. Migration `001_initial_schema` kemudian diterapkan dan seed development eksplisit berhasil dijalankan dua kali tanpa menambah duplikasi. Seed menolak environment production.

## Keputusan yang digunakan pada Tahap 4.4

- Registrasi publik selalu menyimpan role `user`; Owner hanya berasal dari setup/seed.
- `login_id` lowercase 3–32 karakter; password minimal 12 karakter dengan huruf besar, huruf kecil, angka, dan simbol.
- Password menggunakan scrypt dengan format dan parameter yang kompatibel dengan seed.
- Session disimpan server-side pada PostgreSQL; `mt_session` HttpOnly dan `mt_csrf` digunakan untuk double-submit CSRF yang terikat HMAC ke session.
- `COOKIE_SECURE` dan `COOKIE_SAMESITE` dikontrol eksplisit. Preview HTTPS memakai `true`/`none`; HTTP lokal memakai `false`/`lax`.
- Email provider tidak dipaksakan sebelum kredensial eksternal tersedia. Mode test menangkap token di memory tanpa email nyata; mode SMTP tersedia melalui environment.

## Pertanyaan yang ditunda

Pertanyaan berikut sengaja tidak diputuskan pada tahap ini karena memengaruhi tahap bisnis terkait:

1. Zona waktu aplikasi serta aturan deadline harian/bulanan.
2. Rumus final statistik dan laporan.
3. Kebijakan akun nonaktif dan penghapusan akun/tugas secara bisnis.
4. Hard delete atau soft delete untuk entitas bisnis.
5. Bentuk deployment Express pada Vercel dan strategi pooling Neon.
6. Pilihan library grafik dan ikon.
7. Target aksesibilitas formal dan format lokal tanggal/angka.

Tidak ada pertanyaan di atas yang mengubah keputusan stack, role, aturan kepemilikan data, atau identitas visual dalam Master Prompt.
