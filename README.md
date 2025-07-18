# WhatsApp Bot Dashboard

Bot WhatsApp yang dibangun menggunakan Node.js, Express, Baileys, dan SQLite dengan dashboard web untuk mengelola koneksi dan pesan.

## Fitur

- 🔌 Koneksi WhatsApp dengan QR Code
- 💬 Kirim dan terima pesan
- 📱 Dashboard web dengan sidebar menu
- 👥 Manajemen kontak
- 📊 Riwayat pesan
- 🗄️ Penyimpanan data dengan SQLite
- ⚙️ Pengaturan bot

## Teknologi yang Digunakan

- **Backend**: Node.js, Express.js
- **WhatsApp API**: @whiskeysockets/baileys
- **Database**: SQLite3
- **Frontend**: HTML, CSS, jQuery
- **Styling**: Font Awesome, Custom CSS

## Instalasi

1. Clone repository atau download project
2. Install dependencies:
   ```bash
   npm install
   ```

3. Salin dan sesuaikan konfigurasi:
   ```bash
   copy .env.example .env
   ```
   Atau di Linux/Mac:
   ```bash
   cp .env.example .env
   ```

4. Jalankan aplikasi:
   ```bash
   npm start
   ```

5. Buka browser dan akses `http://localhost:3000`

## Cara Penggunaan

### 1. Menghubungkan WhatsApp

1. Buka dashboard di browser
2. Klik menu "Connection" di sidebar
3. Klik tombol "Connect to WhatsApp"
4. Scan QR code yang muncul dengan aplikasi WhatsApp di smartphone
5. Tunggu hingga status berubah menjadi "Connected"

### 2. Mengirim Pesan

1. Klik menu "Send Message" di sidebar
2. Masukkan nomor telefon (dengan kode negara, tanpa +)
3. Ketik pesan yang ingin dikirim
4. Klik "Send Message"

### 3. Melihat Riwayat Pesan

1. Klik menu "Messages" di sidebar
2. Semua pesan masuk dan keluar akan ditampilkan
3. Klik "Refresh" untuk memperbarui daftar

### 4. Melihat Kontak

1. Klik menu "Contacts" di sidebar
2. Semua kontak yang pernah berinteraksi akan ditampilkan
3. Klik "Refresh" untuk memperbarui daftar

### 5. Pengaturan

1. Klik menu "Settings" di sidebar
2. Atur preferensi bot sesuai kebutuhan
3. Klik "Save Settings" untuk menyimpan

## Struktur Project

```
bot_jtronik/
├── src/
│   ├── database.js          # Kelas untuk manajemen database SQLite
│   └── whatsappBot.js       # Kelas utama bot WhatsApp
├── public/
│   ├── css/
│   │   └── styles.css       # Styling dashboard
│   ├── js/
│   │   └── dashboard.js     # JavaScript untuk interaksi frontend
│   └── index.html           # Halaman dashboard utama
├── database/                # Folder untuk file database SQLite
├── sessions/                # Folder untuk session WhatsApp
├── server.js                # Server utama Express.js
├── package.json
├── .env                     # Konfigurasi environment
└── README.md
```

## API Endpoints

- `GET /api/status` - Cek status koneksi dan QR code
- `POST /api/connect` - Inisiasi koneksi WhatsApp
- `POST /api/disconnect` - Putuskan koneksi WhatsApp
- `POST /api/send-message` - Kirim pesan
- `GET /api/messages` - Ambil riwayat pesan
- `GET /api/contacts` - Ambil daftar kontak

## Database Schema

### Tabel `contacts`
- `id` - Primary key
- `phone_number` - Nomor telefon (unique)
- `name` - Nama kontak
- `status` - Status kontak
- `created_at` - Waktu dibuat
- `updated_at` - Waktu diperbarui

### Tabel `messages`
- `id` - Primary key
- `phone_number` - Nomor telefon
- `message_text` - Isi pesan
- `message_type` - Tipe pesan (text, image, dll)
- `direction` - Arah pesan (incoming/outgoing)
- `timestamp` - Waktu pesan
- `message_id` - ID pesan WhatsApp
- `status` - Status pesan

### Tabel `settings`
- `id` - Primary key
- `key_name` - Nama pengaturan
- `key_value` - Nilai pengaturan
- `created_at` - Waktu dibuat
- `updated_at` - Waktu diperbarui

## Pengembangan

### Scripts NPM

- `npm start` - Jalankan aplikasi
- `npm run dev` - Jalankan dengan nodemon (development)

### Menambah Fitur Baru

1. Tambahkan endpoint API di `server.js`
2. Implementasi logika di `src/whatsappBot.js` atau `src/database.js`
3. Update frontend di `public/js/dashboard.js`
4. Tambahkan styling di `public/css/styles.css` jika diperlukan

## Troubleshooting

### Bot tidak terhubung
- Pastikan QR code di-scan dengan benar
- Cek koneksi internet
- Restart aplikasi jika diperlukan

### Database error
- Pastikan folder `database` memiliki permission write
- Cek apakah file database corrupt

### Port sudah digunakan
- Ubah PORT di file `.env`
- Atau hentikan aplikasi yang menggunakan port tersebut

## Kontribusi

1. Fork repository
2. Buat branch fitur baru
3. Commit perubahan
4. Push ke branch
5. Buat Pull Request

## Lisensi

MIT License

## Dukungan

Jika mengalami masalah atau memiliki pertanyaan, silakan buat issue di repository ini.

---

**Catatan**: Bot ini menggunakan WhatsApp Web API melalui Baileys. Pastikan untuk menggunakan bot ini sesuai dengan Terms of Service WhatsApp.
