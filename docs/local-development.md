# Panduan pengembangan lokal dengan VS Code

## Prasyarat

Gunakan Node.js 22 atau lebih baru dan npm 10. PostgreSQL dapat berada di Neon atau server PostgreSQL lain yang dapat dijangkau dari komputer lokal. Project ini tetap menggunakan Node.js + Express, PostgreSQL melalui `pg`, dan frontend HTML/CSS/Vanilla JavaScript.

## Menyiapkan workspace

Buka folder project `manajementugas` di VS Code. Salin `.env.example` menjadi `.env`, lalu isi `DATABASE_URL` dan `SESSION_SECRET` secara lokal. Jangan menyalin secret ke file yang akan di-commit, issue, chat, atau ZIP. Untuk Neon, gunakan URL dengan `sslmode=verify-full`; pool juga menormalkan mode legacy ke mode tersebut.

```bash
npm install
npm run check
npm start
```

Buka `http://localhost:3000`. Untuk local HTTP, gunakan `COOKIE_SECURE=false` dan `COOKIE_SAMESITE=lax`. Untuk Cloud Preview HTTPS, gunakan `npm run preview` agar cookie menjadi `Secure` dan `SameSite=None`.

## Database development

Pastikan `DATABASE_URL` menunjuk ke database development yang tepat sebelum migration. Jalankan migration hanya bila memang diperlukan:

```bash
npm run db:migrate
```

Seed hanya untuk development dan harus diaktifkan eksplisit. Jangan menjalankan seed terhadap production:

```bash
SEED_ENABLED=true \
SEED_OWNER_PASSWORD='password-development' \
SEED_USER_PASSWORD='password-development' \
npm run db:seed
```

Migration bersifat additive dan seed idempotent sesuai dokumentasi [`database-schema.md`](database-schema.md). Jangan mereset database atau menghapus data existing untuk memperbaiki test.

## Validasi dan pengujian

```bash
npm run check
npm test
npm audit
```

Integration test mutatif hanya boleh menggunakan database terisolasi. Set `TEST_DATABASE_URL` ke DSN yang berbeda dari `DATABASE_URL`; runner akan memindahkan koneksi test ke DSN tersebut. Tanpa DSN terisolasi, test mutatif dilewati dan test read-only tetap berjalan. Jangan mengaktifkan `ALLOW_MUTATING_TESTS` atau `ISOLATED_TEST_DATABASE` secara manual pada database utama.

## Alur VS Code yang disarankan

Gunakan terminal terintegrasi untuk menjalankan server, dan terminal kedua untuk `curl` atau test. Periksa `GET /api/health` setelah server siap. Gunakan Preview/browser untuk memeriksa route publik dan protected setelah login dengan akun development yang terdokumentasi. Password development tetap hanya digunakan pada environment development dan tidak boleh dimasukkan ke source code.

## Troubleshooting singkat

Jika `DATABASE_URL` tidak terbaca, pastikan file `.env` berada di root project dan tidak bernama `.env.example`. Jika cookie login tidak bekerja pada Cloud Preview, jalankan `npm run preview`, bukan `npm start`, agar atribut cross-site HTTPS benar. Jika email belum terkirim, periksa `EMAIL_MODE`; tanpa konfigurasi SMTP, gunakan `test`, `simulation`, atau `disabled` sesuai konteks, karena provider production belum dikonfigurasi.
