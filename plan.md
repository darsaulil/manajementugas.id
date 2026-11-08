# Rencana Implementasi ManajemenTugas.id

## Acuan

Master Prompt ManajemenTugas.id adalah acuan utama. Stack wajib tetap HTML/CSS/Vanilla JavaScript, Node.js + Express, PostgreSQL Neon, dan `pg`. Deployment tidak dilakukan pada rangkaian kerja ini.

## Tahap selesai: 4.1 Fondasi Teknis

Tahap ini dibatasi pada:

- Struktur folder modular.
- Manifest package Node.js dan script foundation.
- Validasi environment tanpa mencetak secret.
- PostgreSQL connection pool melalui `pg`.
- Express app dan server runtime.
- Health check read-only `SELECT 1`.
- Respons JSON 404 dan error internal yang aman.
- Route manifest Webdev.
- `.env.example`, `.gitignore`, README, serta catatan asumsi.
- Pengujian syntax dan integration ringan untuk health endpoint.

Tahap ini tidak mencakup migration, seed, autentikasi, otorisasi, fitur tugas, laporan, email, atau deployment.

## Tahap selesai: 4.2 Design System dan Shell Frontend

Tahap ini dibatasi pada landing shell publik, design tokens, komponen UI dasar, navigasi responsif, light/dark mode, preview dashboard demo yang diberi label, dan interaksi Vanilla JavaScript yang tidak mengirim data bisnis.

Tidak ada autentikasi, CRUD, dashboard bisnis nyata, migration, seed, atau deployment pada tahap ini.

## Tahap selesai: 4.3 Database Schema, Migration, dan Seed Data

Tahap ini membuat schema PostgreSQL additive yang tercatat pada `schema_migrations`, menjalankan migration terhadap Neon Development setelah pemeriksaan awal, membuat seed development eksplisit yang idempotent, serta memvalidasi foreign key, constraint, index, jumlah data, ownership, dan format password hash.

Tidak ada autentikasi lengkap, CRUD tugas, dashboard bisnis, laporan, integrasi email, atau deployment pada tahap ini.

## Tahap selesai: 4.4 Autentikasi dan Keamanan

Tahap ini menambahkan registrasi User yang terhubung ke Neon, login/logout berbasis ID dan password, password scrypt kompatibel seed, session server-side PostgreSQL, cookie `mt_session` HttpOnly, cookie `mt_csrf`, CSRF validation, session rotation, security headers, rate limiting, role authorization Owner/User, proteksi akun nonaktif, verifikasi email, forgot/reset password, halaman auth responsif, dan protected redirect placeholder.

Email provider mendukung mode `disabled`, `simulation`, `test`, dan SMTP opsional. Karena kredensial provider eksternal belum tersedia, test memakai mode capture in-memory dan tidak mengirim email nyata.

CRUD tugas, dashboard bisnis, laporan, pengaturan akun lengkap, dan deployment tetap di luar tahap ini.

## Tahap selesai: 4.5 CRUD Tugas, REST API, Audit, dan Perbaikan Fondasi

Audit awal menjalankan `npm run check` dan `npm test`. Satu kegagalan terbukti sebagai race condition pada `tests/database.integration.test.js`: assertion count global persis bertabrakan dengan user sementara dari test auth paralel. Test diperbaiki agar memverifikasi ID seed tetap dan batas minimum global. Tidak ditemukan kebocoran secret, bypass auth/CSRF/role, atau inkonsistensi schema pada audit ini.

Tahap ini menambahkan task service/query terparameterisasi, validasi field dan filter, route REST yang memakai session/CSRF, scope User/Owner server-side, summary statistik, serta UI dashboard tugas nyata dengan search, filter, form create/edit, status toggle, delete confirmation, loading, empty, success, dan error states. Overdue/urgent dihitung dari `deadline` + `status` saat query; tidak ada status database baru.

User membuat tugas atas akun sendiri. Owner dapat mengelola seluruh tugas, tetapi pembuatan tugas Owner tetap memakai akun Owner yang sedang login karena penugasan ke akun lain belum ditetapkan sebagai keputusan produk. Schema existing sudah cukup sehingga tidak ada migration baru, reset database, atau seed ulang.

## Tahap selesai: 4.6 Dashboard Lengkap, Laporan, Pengaturan Akun, dan Audit

Audit baseline aktual pada 2026-10-29 menemukan working tree bersih di checkpoint `c4c79ac`, `npm run check` berhasil, dan 5 integration test existing berhasil. Tidak ada migration tambahan yang dibutuhkan untuk laporan, akun, atau status user karena schema existing sudah menyediakan `users`, timestamp, token verifikasi, session, dan relasi task.

Dashboard User dipertahankan sebagai sumber data nyata dari API task. Dashboard Owner dibuat terpisah dengan agregasi SQL untuk user aktif/nonaktif, task global, perbandingan per-user, pencarian, filter akun, detail user, dan aktivasi/nonaktif akun. Penonaktifan menghapus session target tetapi mempertahankan tugas; Owner terakhir tidak dapat dinonaktifkan dan Owner tidak dapat menonaktifkan dirinya sendiri sebagai pengaman lockout.

Laporan memakai snapshot `NOW()` pada satu statement PostgreSQL dan UTC sebagai zona perhitungan. Mode harian memilih satu hari dan membuat bucket per jam; mode bulanan memilih satu bulan dan membuat bucket per hari. Total saat laporan dibuka adalah seluruh task dalam scope sampai snapshot. Persentase periode mengikuti Master Prompt: jumlah task yang selesai selama periode dibagi jumlah task yang dibuat selama periode; denominator nol menghasilkan 0%. Laporan Owner menyediakan perbandingan pengguna.

Pengaturan akun memakai endpoint privat dengan CSRF: profil, perubahan password dengan password saat ini, perubahan email dengan validasi unik dan token verifikasi ulang, tema lokal light/dark, dan logout. Email provider production tidak dikonfigurasi; mode test dipakai untuk integration test.

Penugasan task antar pengguna sengaja tidak diimplementasikan. Master Prompt belum mendefinisikan perbedaan pemilik, pembuat, dan pihak pengubah; menambahkan kolom atau menumpangkan fitur pada `owner_id` akan mengubah model ownership secara diam-diam. Endpoint Owner tetap dapat melihat task lintas pengguna sesuai model Tahap 4.5.

Implementasi mencakup route manifest halaman baru, query terparameterisasi tanpa N+1, responsive CSS dengan breakpoint existing, loading/empty/error/feedback state, integration test role/period/account safety, dan checkpoint Git. Deployment tetap dilarang pada tahap ini.

Validasi akhir menghasilkan `npm run check` berhasil dan 7 test lulus tanpa kegagalan. Smoke test HTTP memverifikasi health `200`, root `200`, route manifest `200`, serta penolakan anonymous `401` pada endpoint Owner, reports, settings, dan halaman privat. Preview browser memverifikasi login User/Owner, dashboard task, reports, settings, navigasi, dan tidak ada error console yang terlihat.

## Tahap selesai: 5 Final Audit, Optimasi, dan Finalisasi

Audit final memeriksa source frontend/backend, REST API, migration/seed, Neon, auth, session, CSRF, role/ownership, dashboard User/Owner, laporan, settings, dokumentasi, dan konfigurasi. Temuan terbukti adalah label landing yang stale (`Tahap 4.5`), lalu diperbaiki menjadi `Tahap 4.6`. Pool PostgreSQL dinormalkan ke `sslmode=verify-full` untuk menghilangkan warning legacy tanpa menurunkan verifikasi sertifikat.

`npm run check` berhasil, `npm test` menghasilkan 4 pass, 3 skipped, dan 0 fail karena test mutatif diguard tanpa `TEST_DATABASE_URL` terisolasi, `npm audit` menghasilkan 0 vulnerability, HTTP smoke test lulus, database read-only audit lulus, dan screenshot responsive diperiksa pada desktop 1280x720, tablet 768x1024, serta mobile 375x812. Migration additive `002_nickname.sql` mengisi nickname enam akun existing tanpa membuat akun baru. ZIP final dibuat tanpa `.git`, `node_modules`, `.env`, log, coverage, atau credential asli. Deployment Vercel tidak dilakukan.

## Tahap berikutnya

Tahap 6 dan seterusnya hanya dikerjakan setelah instruksi terpisah dari pemilik proyek. Penugasan lintas pengguna, provider email production, dan deployment Vercel masih membutuhkan keputusan atau konfigurasi eksternal.
