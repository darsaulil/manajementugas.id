# TODO ManajemenTugas.id

## Fondasi teknis — Tahap 4.1

- [x] Menyiapkan project Node.js modular dengan Express dan package `pg`.
- [x] Menyiapkan validasi `DATABASE_URL` dari environment tanpa menulis nilainya ke source code.
- [x] Menyiapkan pool PostgreSQL dan graceful shutdown.
- [x] Menyiapkan `GET /api/health` dengan query read-only `SELECT 1`.
- [x] Menyiapkan respons JSON aman untuk route yang tidak ditemukan dan error internal.
- [x] Menyiapkan `.env.example`, `.gitignore`, README, route manifest, dan dokumentasi asumsi.
- [x] Menyiapkan test foundation untuk health endpoint dan 404.
- [x] Menjalankan validasi aktual setelah dependency terpasang.

## Design system dan shell frontend — Tahap 4.2

- [x] Membangun shell HTML5 semantik untuk halaman publik.
- [x] Menetapkan token warna, tipografi, spacing, radius, border, shadow, dan komponen dasar.
- [x] Menambahkan navbar mengambang desktop serta navigasi mobile yang dapat dibuka/tutup.
- [x] Menambahkan light mode/dark mode dengan persistensi preferensi tema saja.
- [x] Menambahkan breakpoint CSS eksplisit untuk desktop, tablet, dan mobile.
- [x] Menambahkan loading, empty, error, feedback, form field, card, dan toast foundation.
- [x] Menambahkan preview dashboard yang diberi label sebagai data ilustrasi terpisah.
- [x] Menjalankan pemeriksaan syntax, server, route manifest, dan screenshot beberapa viewport.

## Database schema, migration, dan seed — Tahap 4.3

- [x] Memeriksa database Neon secara read-only sebelum perubahan; tidak ada tabel/view publik tak terduga.
- [x] Membuat tabel users, tasks, token verifikasi/reset, sessions, dan schema_migrations.
- [x] Menetapkan primary key, foreign key, unique/check constraint, index, timestamp, dan kebijakan delete.
- [x] Menjalankan migration `001_initial_schema` secara transaksional dan mencatat checksum.
- [x] Membuat seed development eksplisit untuk 1 Owner, 5 User, dan 15 tugas bervariasi.
- [x] Menjalankan seed kedua kali dan memverifikasi tidak ada duplikasi.
- [x] Memverifikasi ownership, variasi type/status/deadline, dan password hash scrypt.
- [x] Menambahkan test integration read-only untuk invariant database.
- [x] Memastikan seed menolak environment production.

## Autentikasi dan keamanan — Tahap 4.4

- [x] Registrasi publik terhubung ke PostgreSQL, memvalidasi ID/email/password, selalu membuat role User, dan menolak role Owner dari request.
- [x] Login memakai ID/password, menentukan role dari database, menolak kredensial salah, akun nonaktif, dan email belum terverifikasi.
- [x] Logout menghapus session server-side dan cookie.
- [x] Session disimpan di PostgreSQL, cookie session HttpOnly, cookie CSRF terpisah, session rotation setelah login, dan invalidasi session lama setelah reset password.
- [x] User ditolak dari endpoint Owner; pengunjung anonim ditolak dari endpoint privat; akun nonaktif ditolak termasuk melalui session lama.
- [x] CSRF protection, security headers, input validation, dan rate limiting diterapkan pada endpoint auth sensitif.
- [x] Token verifikasi email dan reset password disimpan sebagai hash, memiliki expiry, dan ditolak setelah digunakan ulang.
- [x] Halaman Login, Registrasi, Verifikasi Email, Lupa Password, Reset Password, serta protected redirect placeholder tersambung ke design system.
- [x] Mode email `disabled`, `simulation`, `test`, dan `smtp` terdokumentasi; test tidak mengirim email nyata.
- [x] Menjalankan `npm run check`, `npm test`, route check, health check, dan verifikasi atribut cookie Preview.

## CRUD tugas, REST API, audit, dan perbaikan fondasi — Tahap 4.5

- [x] Menjalankan audit awal fondasi, syntax check, dan integration test sebelum perubahan.
- [x] Memperbaiki race condition test database yang mengandalkan jumlah global persis ketika test auth berjalan paralel; invariant sekarang memverifikasi record seed tetap.
- [x] Menambahkan REST API list, summary, detail, create, update, status update, dan delete tugas.
- [x] Menegakkan session authentication, CSRF untuk mutasi, parameterized query, validasi backend, dan ownership User/Owner server-side.
- [x] User hanya dapat mengelola tugas miliknya; Owner dapat mengelola seluruh tugas; akses tugas milik user lain mengembalikan 404.
- [x] Menambahkan perhitungan server-side untuk status urgent dan overdue tanpa menyimpan label visual sebagai status database.
- [x] Menambahkan dashboard tugas nyata untuk User/Owner dengan search, filter, summary, form tambah/edit, status toggle, delete confirmation, loading, empty, success, dan error state.
- [x] Memastikan preview dashboard landing tetap data ilustrasi dan tidak membaca database.
- [x] Menjalankan test CRUD aktual untuk validasi input, ownership, anonymous access, filter, urgent/overdue, persistence, status, delete, dan CSRF.
- [x] Menjalankan HTTP smoke test terhadap server Preview serta pemeriksaan route manifest dan protected pages.
- [x] Memperbarui README, plan, TODO, dan dokumentasi API tugas.
- [x] Tidak membuat migration/seed baru dan tidak menghapus data existing.

## Dashboard lengkap, laporan, pengaturan akun, dan audit — Tahap 4.6

- [x] Audit aktual fondasi, auth, CRUD, query, session, CSRF, responsive layout, dan dokumentasi; catat masalah terbukti dan perbaiki P0/P1.
- [x] Dashboard User tetap memakai data nyata dari API/database dan menampilkan total, selesai, pending, persentase, deadline, daftar tugas, urgent/overdue, search, serta filter.
- [x] Dashboard Owner menampilkan agregasi database untuk total pengguna, akun aktif/nonaktif, total task, task selesai/pending/urgent/overdue, persentase, grafik perbandingan pengguna, daftar pengguna, pencarian/filter pengguna, detail user, dan ringkasan task.
- [x] Endpoint Owner memeriksa role server-side; User dan anonymous tidak dapat membaca statistik global atau data pengguna lain melalui URL, query, maupun API.
- [x] Owner dapat melihat detail pengguna, mengaktifkan/menonaktifkan akun, menghapus session akun nonaktif, mempertahankan task akun tersebut, dan mendapat konfirmasi pada tindakan administratif.
- [x] Owner terakhir tidak dapat dinonaktifkan; penghapusan permanen pengguna tidak ditambahkan.
- [x] Penugasan task lintas pengguna tidak diimplementasikan sebelum aturan pemilik/pembuat/pengubah ditetapkan secara eksplisit.
- [x] Laporan User dan Owner mendukung periode harian/bulanan, statistik task, status penyelesaian, persentase sesuai rumus Master Prompt, grafik, empty state, denominator nol, dan snapshot konsisten.
- [x] Pengaturan akun menyediakan profil, status verifikasi email, perubahan password dengan password saat ini, tema light/dark, logout, serta perubahan email unik dengan verifikasi ulang bila provider tersedia; role tidak dapat diubah.
- [x] Semua endpoint privat memeriksa session/role, mutasi memakai CSRF, input divalidasi, query berparameter, agregasi menghindari N+1, dan secret/token tidak bocor.
- [x] Menjalankan test aktual untuk dashboard User/Owner, role, anonymous, account deactivation, Owner guard, laporan harian/bulanan, denominator nol, settings/password/email, responsive/theme, dan regresi auth/CRUD.
- [x] Memperbarui README, plan, TODO, dokumentasi API/laporan, migration bila benar-benar diperlukan, checkpoint Git, dan memastikan deployment Vercel belum dilakukan.

## Final audit, optimasi, dan finalisasi — Tahap 5

- [x] Audit final seluruh source, REST API, database, autentikasi, session, CSRF, dashboard, laporan, settings, dokumentasi, dan konfigurasi.
- [x] Memperbaiki label landing stale yang masih menyebut Tahap 4.5.
- [x] Menormalkan SSL Neon ke `sslmode=verify-full` tanpa menurunkan keamanan koneksi atau mengubah secret asli.
- [x] Menjalankan `npm run check`, `npm test` dengan 4 test read-only lulus dan 3 test mutatif dilewati tanpa database terisolasi, `npm audit` dengan 0 vulnerability, HTTP smoke test, database read-only audit, dan browser audit.
- [x] Memeriksa responsive desktop `1280x720`, tablet `768x1024`, dan mobile `375x812`, serta konsistensi light/dark design system.
- [x] Menambahkan migration additive nickname untuk enam akun existing tanpa membuat akun baru, lalu memperbarui README, plan, TODO, dokumentasi database, keamanan, API, laporan, autentikasi, dan panduan VS Code.
- [x] Membuat ZIP final tanpa `node_modules`, `.git`, `.env`, log, coverage, atau credential asli.
- [x] Menyimpan checkpoint Git final dan memastikan deployment Vercel belum dilakukan.

## Tahap berikutnya — menunggu instruksi

- [ ] Penugasan task lintas pengguna setelah aturan pemilik/pembuat/pengubah ditetapkan.
- [ ] Integrasi provider email production setelah kredensial protected secret tersedia.
- [ ] Dokumentasi deployment dan deployment Vercel hanya setelah ada instruksi eksplisit.
