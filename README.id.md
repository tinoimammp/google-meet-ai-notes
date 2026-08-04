# Meetly AI Notes

🌍 *Baca dalam [English](README.md)*

> Repo: [github.com/tinoimammp/google-meet-ai-notes](https://github.com/tinoimammp/google-meet-ai-notes)

Chrome extension untuk menangkap live caption Google Meet secara lokal dan meringkasnya menjadi catatan rapat (ringkasan, poin penting, action items) menggunakan Gemini API. Hasilnya bisa langsung di-download sebagai file `.txt`.

## ✨ Fitur Utama
- **Otomatis & Lokal**: Menyalakan caption otomatis dan membaca teks langsung dari browser (tanpa rekam audio/mikrofon).
- **Ringkasan Pintar**: Menggunakan Gemini API untuk merangkum transkrip beserta nama pembicara.
- **Privasi Terjaga**: API key disimpan lokal, data hanya dikirim sekali ke Gemini saat meminta ringkasan.

## 🚀 Cara Penggunaan & Instalasi
1. Dapatkan **Gemini API Key** gratis di [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Download repo ini (lalu ekstrak) atau clone: `git clone https://github.com/tinoimammp/google-meet-ai-notes.git`
3. Buka `chrome://extensions`, aktifkan **Developer mode**, lalu klik **Load unpacked** dan pilih folder repo.
4. Buka Google Meet, klik icon extension, masukkan API key, lalu klik **Start**.
5. Klik **Stop & Summarize** di akhir rapat untuk men-download hasilnya.
