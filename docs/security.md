# Audit keamanan ManajemenTugas.id

## Kontrol yang diterapkan

- Password menggunakan `crypto.scrypt` dengan salt acak; password plaintext tidak disimpan.
- Token verifikasi email, reset password, session, dan CSRF tidak disimpan dalam bentuk plaintext di database.
- Session disimpan server-side pada PostgreSQL dengan cookie `mt_session` HttpOnly.
- Cookie CSRF `mt_csrf` terpisah dan wajib dikirim sebagai `X-CSRF-Token` untuk mutasi.
- Preview HTTPS menggunakan `Secure` dan `SameSite=None`; HTTP lokal menggunakan `Secure=false` dan `SameSite=Lax`.
- Role dan ownership selalu ditentukan dari session server-side, bukan dari URL atau input browser.
- User hanya dapat membaca/mengubah task miliknya. Owner memiliki scope global sesuai endpoint Owner.
- Akun nonaktif ditolak, dan session aktifnya dicabut saat dinonaktifkan.
- Owner terakhir dan self-deactivation dilindungi oleh pemeriksaan bisnis dan advisory transaction lock.
- Query PostgreSQL menggunakan parameter, termasuk pencarian, filter, pagination, laporan, dan perubahan status akun.
- Validasi input dijalankan pada backend; error response tidak menampilkan SQL, stack trace, connection string, token, atau password.
- `helmet` menyediakan security headers dan `express-rate-limit` membatasi endpoint autentikasi sensitif.
- `DATABASE_URL`, `SESSION_SECRET`, dan kredensial SMTP berasal dari environment/protected secret, bukan source code atau Git.
- Pool PostgreSQL menormalkan mode legacy `prefer`, `require`, dan `verify-ca` ke `verify-full` agar sertifikat diverifikasi terhadap hostname.

## Hasil pemeriksaan final

- Credential scan source dan dokumentasi: bersih.
- Database audit read-only: 6 user, 15 task, 0 token email pending, 0 token reset pending, dan 0 session tersisa setelah cleanup test.
- Test read-only role/anonymous/schema/health/404/Owner guard lulus. Test integrasi mutatif registrasi dan CRUD hanya dijalankan jika `TEST_DATABASE_URL` berbeda dari `DATABASE_URL` dan dua guard mutasi diaktifkan; pada database proyek utama test tersebut dilewati agar tidak membuat akun/task tambahan.
- `npm audit` wajib dijalankan sebelum final ZIP; hasil aktual dicatat di laporan final/README.

## Batas keamanan yang masih terbuka

Provider email production belum dikonfigurasi. Mode `test` dan `disabled` tidak mengirim email sungguhan. Deployment Vercel belum dilakukan, sehingga konfigurasi secret dan TLS deployment harus divalidasi lagi pada environment target.
