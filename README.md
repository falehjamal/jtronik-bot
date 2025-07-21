# Jtronik Bot

WhatsApp & Jabber bot dengan dashboard web untuk manajemen transaksi.

## Fitur

- � WhatsApp Bot dengan QR Code login
- � Jabber/XMPP connection
- 📊 Import transaksi dari Excel
- 🚀 Kirim transaksi via WhatsApp atau Jabber
- 🌐 Dashboard web interface

## Instalasi

```bash
npm install
npm start
```

Buka browser di `http://localhost:3000`

## Penggunaan

1. **WhatsApp**: Klik "Connection" → "Connect to WhatsApp" → Scan QR code
2. **Jabber**: Klik "Jabber Connect" → Isi konfigurasi → "Connect to Jabber"  
3. **Transaksi**: Import Excel → Pilih metode pengiriman → Kirim

## Tech Stack

- Node.js + Express
- @whiskeysockets/baileys (WhatsApp)
- @xmpp/client (Jabber)
- SQLite3 database
- jQuery frontend

## Lisensi

MIT
