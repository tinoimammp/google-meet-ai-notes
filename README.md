# Meetly AI Notes

🌍 *Read this in [Bahasa Indonesia](README.id.md)*

> Repo: [github.com/tinoimammp/google-meet-ai-notes](https://github.com/tinoimammp/google-meet-ai-notes)

A Chrome extension to capture Google Meet live captions locally and summarize them into meeting notes (summary, key points, action items) using the Gemini API. The result can be downloaded directly as a `.txt` file.

## ✨ Key Features
- **Automatic & Local**: Turns on captions automatically and reads text directly from the browser (no audio/microphone recording).
- **Smart Summary**: Uses Gemini API to summarize the transcript along with the speaker's name.
- **Privacy First**: API key is stored locally, data is only sent once to Gemini when requesting a summary.

## 🚀 Usage & Installation
1. Get a free **Gemini API Key** at [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Download this repo (then extract) or clone: `git clone https://github.com/tinoimammp/google-meet-ai-notes.git`
3. Open `chrome://extensions`, enable **Developer mode**, then click **Load unpacked** and select the repo folder.
4. Open Google Meet, click the extension icon, enter the API key, then click **Start**.
5. Click **Stop & Summarize** at the end of the meeting to download the results.
