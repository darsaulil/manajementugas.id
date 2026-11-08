# Laporan dan dashboard Owner — Tahap 4.6

## Scope dan akses

`GET /api/reports` membutuhkan session. User hanya menerima task miliknya. Owner menerima agregasi global dan perbandingan seluruh pengguna. User/anonymous tidak dapat memanggil endpoint Owner.

Dashboard User tetap `/dashboard`; dashboard Owner terpisah di `/owner/dashboard`. Landing page tetap memiliki preview ilustrasi yang tidak mengambil data database.

## Periode dan snapshot

Query menerima:

- `mode=daily&value=YYYY-MM-DD`: satu hari UTC, dengan grafik 24 bucket per jam.
- `mode=monthly&value=YYYY-MM`: satu bulan UTC, dengan satu bucket per hari.

Endpoint menjalankan query dalam transaksi `REPEATABLE READ` dan mengambil `NOW()` sebagai `snapshotAt`. Semua agregasi dalam satu response memakai snapshot yang sama. Tugas yang dibuat setelah snapshot tidak masuk laporan tersebut.

`totalTasks` adalah seluruh task dalam scope user/Owner yang sudah ada saat snapshot dibuka. Statistik periode terpisah menjadi:

- `createdInPeriod`: jumlah task yang dibuat selama periode.
- `completedInPeriod`: jumlah task yang selesai selama periode berdasarkan `completed_at`, termasuk task yang dibuat sebelum periode.
- `periodCompletionPercentage`: `completedInPeriod / createdInPeriod * 100`. Jika denominator nol, hasilnya `0`.

`completionPercentage` adalah persentase selesai dari seluruh task pada snapshot. `urgentTasks` dan `overdueTasks` dihitung dari status pending dan deadline pada waktu snapshot.

## Dashboard Owner

`GET /api/owner/overview` mengembalikan jumlah user total/aktif/nonaktif, statistik task global, serta ringkasan per pengguna. Filter `search`, `status=all|active|inactive`, `limit`, dan `offset` dijalankan dengan query berparameter. `GET /api/owner/users/:userId` mengembalikan profil non-rahasia, ringkasan task, dan maksimal 20 task terbaru.

`PATCH /api/owner/users/:userId/status` menerima `{ "isActive": true|false }` dan membutuhkan CSRF. Menonaktifkan user menghapus session aktif user tersebut tetapi tidak menghapus task. Tidak tersedia endpoint penghapusan permanen.

Owner terakhir tidak dapat dinonaktifkan. Perubahan status Owner memakai PostgreSQL advisory transaction lock agar dua request administratif bersamaan tidak dapat meninggalkan sistem tanpa Owner. Owner juga tidak dapat menonaktifkan dirinya sendiri.

## Pengaturan akun

- `GET /api/account/me`: profil login ID, email, role, status aktif, status verifikasi, dan timestamp; tidak pernah mengembalikan password/hash.
- `POST /api/account/password`: memerlukan password saat ini, password baru tervalidasi, CSRF, menghapus session lain, dan membuat session baru untuk browser saat ini.
- `POST /api/account/email`: memerlukan password saat ini, email unik dan valid, mengubah email menjadi belum terverifikasi, dan membuat token verifikasi satu kali. Provider email mengikuti `EMAIL_MODE` existing; production SMTP tetap belum dikonfigurasi.

Role tidak dapat diubah dari settings. Tema disimpan sebagai preferensi lokal design system, bukan sebagai data akun.

## Penugasan task

Penugasan lintas pengguna tidak diimplementasikan. Master Prompt belum mendefinisikan perbedaan pemilik, pembuat, dan pihak yang boleh mengubah task. Menambahkan fitur tersebut tanpa keputusan ini akan menumpangkan arti baru pada `tasks.owner_id`; keputusan produk diperlukan sebelum migration atau model ownership baru dibuat.
