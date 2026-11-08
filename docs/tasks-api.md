# REST API tugas — Tahap 4.5

## Akses dan ownership

Semua endpoint di bawah ini membutuhkan session server-side yang valid. Semua method mutasi (`POST`, `PATCH`, `DELETE`) juga membutuhkan header `X-CSRF-Token` yang sama dengan cookie `mt_csrf`.

- User hanya melihat dan mengubah tugas dengan `owner_id` yang berasal dari `request.auth.userId`.
- Owner dapat membaca, mengubah, dan menghapus seluruh tugas. Scope Owner dijalankan oleh query server, bukan oleh `owner_id` yang dipercaya dari browser.
- User/Owner yang meminta ID tugas di luar scope menerima `404 TASK_NOT_FOUND`, sehingga keberadaan data milik pengguna lain tidak dibocorkan.
- Saat Owner membuat tugas, pemiliknya tetap akun Owner yang sedang login. Penugasan tugas ke akun lain belum menjadi keputusan produk dan tidak menerima `owner_id` dari frontend.

## Endpoint

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/api/tasks` | Daftar tugas sesuai scope session |
| `GET` | `/api/tasks/summary` | Total, pending, completed, urgent, overdue, persentase selesai |
| `GET` | `/api/tasks/:id` | Detail satu tugas sesuai scope |
| `POST` | `/api/tasks` | Membuat tugas pending milik session |
| `PATCH` | `/api/tasks/:id` | Mengedit nama, deskripsi, jenis, deadline, atau status |
| `PATCH` | `/api/tasks/:id/status` | Mengubah status menjadi `pending` atau `completed` |
| `DELETE` | `/api/tasks/:id` | Menghapus tugas sesuai kebijakan dan scope |

Jenis tugas yang diterima: `biasa`, `ribet`, `prioritas`. Status database hanya `pending` dan `completed`. Ketika status menjadi `completed`, `completed_at` diisi; ketika kembali `pending`, `completed_at` dikosongkan.

## Query list dan filter

`GET /api/tasks` menerima:

- `search` atau `q`: pencarian backend pada nama tugas menggunakan `ILIKE` berparameter.
- `taskType`: `biasa`, `ribet`, atau `prioritas`.
- `status`: `pending` atau `completed`.
- `flag`: `urgent` atau `overdue`.
- `deadlineFrom`, `deadlineTo`: tanggal ISO 8601 inklusif.
- `sort`: `deadline_asc`, `deadline_desc`, `created_desc`, atau `created_asc`.
- `limit`: 1–100, default 50.
- `offset`: offset non-negatif, default 0.
- `ownerId`: hanya dipakai pada scope Owner dan divalidasi sebagai UUID.

Response task menyertakan `isUrgent`, `isOverdue`, dan `secondsToDeadline`. Field tersebut dihitung setiap query dari `deadline`, `status`, dan waktu database saat ini; tidak disimpan sebagai status database.

- Overdue: `status = pending` dan `deadline < NOW()`.
- Urgent: `status = pending` dan `deadline >= NOW()` serta `deadline <= NOW() + INTERVAL '3 days'`.
- Completed tidak pernah urgent dan tetap completed walaupun deadline telah lewat.

Deadline disimpan sebagai `TIMESTAMPTZ`. Perbandingan bisnis menggunakan waktu database PostgreSQL secara konsisten; browser memformat ISO timestamp ke locale perangkat. Laporan Tahap 4.6 memakai UTC untuk batas hari/bulan dan mendokumentasikan snapshot serta rumus pada [`reports.md`](reports.md).

## Response dan keamanan

Response sukses memakai bentuk `{ data: ... }`; error memakai `{ error: { code, message, details? } }`. Query PostgreSQL seluruhnya berparameter. Tidak ada endpoint yang menerima `owner_id` sebagai sumber identitas User.

Dashboard `/dashboard` untuk User dan `/owner/dashboard` untuk Owner sekarang menyajikan halaman tugas nyata. Preview dashboard pada landing `/` tetap ilustrasi terpisah dan tidak mengambil data database.

Tidak ada migration baru pada Tahap 4.5 karena schema `tasks` yang ada sudah mencakup field CRUD, status, deadline, timestamp, constraint, dan index yang diperlukan. Tidak ada seed ulang dan tidak ada data existing yang dihapus.
