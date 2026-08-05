// background.js

// Simpan transkrip per tabId, biar kalau ada beberapa meeting sekaligus nggak ketuker
const transcripts = {}; // { [tabId]: [{ speaker, text, timestamp }] }

// Tab yang transkripnya udah didownload manual (lewat Stop & Summarize),
// biar nggak auto-download dobel pas tabnya ditutup.
const downloadedTabs = new Set();

function transcriptStorageKey(tabId) {
  return `transcript_${tabId}`;
}

function persistTranscript(tabId) {
  chrome.storage.local.set({ [transcriptStorageKey(tabId)]: transcripts[tabId] });
}

// Service worker MV3 bisa di-restart Chrome kapan aja (misal pas idle karena
// nggak ada suara sesaat), yang bikin `transcripts` di atas ke-reset kosong
// dan transkrip meeting yang lagi jalan lama jadi hilang. Di sini kita pulihkan
// transkrip yang sempat kesimpen dari storage begitu worker ini hidup lagi.
chrome.storage.local.get(null, (all) => {
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith("transcript_") && Array.isArray(value)) {
      const tabId = Number(key.slice("transcript_".length));
      // Jangan timpa kalau udah ada data live yang masuk duluan.
      if (!Number.isNaN(tabId) && !transcripts[tabId]) {
        transcripts[tabId] = value;
      }
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;

  if (message.type === "CAPTION_LINE_FINAL" && tabId !== null) {
    if (!transcripts[tabId]) transcripts[tabId] = [];
    transcripts[tabId].push(message.payload);
    persistTranscript(tabId);
    return; // no response needed
  }

  if (message.type === "GET_TRANSCRIPT") {
    // Popup minta transkrip dari tab aktif
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0]?.id;
      sendResponse({ transcript: transcripts[activeTabId] || [] });
    });
    return true; // async response
  }

  if (message.type === "CLEAR_TRANSCRIPT") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0]?.id;
      transcripts[activeTabId] = [];
      downloadedTabs.delete(activeTabId);
      chrome.storage.local.remove(transcriptStorageKey(activeTabId));
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "MARK_DOWNLOADED") {
    // Popup ngasih tau kalau transkrip tab aktif udah didownload manual,
    // biar auto-download pas tab ditutup nggak bikin file dobel.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0]?.id;
      if (activeTabId !== undefined) downloadedTabs.add(activeTabId);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "SUMMARIZE") {
    const { apiKey, transcript, lang } = message.payload;
    summarizeWithGemini(apiKey, transcript, lang || "id")
      .then(({ summary, correctedTranscript }) =>
        sendResponse({ ok: true, summary, correctedTranscript })
      )
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }

  if (message.type === "VALIDATE_API_KEY") {
    validateApiKey(message.payload.apiKey)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }
});

// Bersihkan transkrip kalau tab ditutup, tapi auto-download dulu selama
// belum sempat di-download manual (misal meeting/tab ketutup sendiri).
chrome.tabs.onRemoved.addListener((tabId) => {
  autoDownloadIfNeeded(tabId);
  delete transcripts[tabId];
  downloadedTabs.delete(tabId);
  chrome.storage.local.remove([
    `captureStart_${tabId}`,
    transcriptStorageKey(tabId),
  ]);
});

function autoDownloadIfNeeded(tabId) {
  if (downloadedTabs.has(tabId)) return; // udah didownload manual
  const transcript = transcripts[tabId];
  if (!transcript || transcript.length === 0) return;

  chrome.storage.local.get(["uiLang"], ({ uiLang }) => {
    const lang = uiLang === "en" ? "en" : "id";
    const text = buildAutoSaveText(transcript, lang);
    downloadTextFileFromBackground(text, `meeting-notes-autosave-${dateStamp()}.txt`);
  });
}

const AUTOSAVE_STRINGS = {
  id: {
    header: "=== MEETING NOTES (auto-save) ===",
    note: 'Catatan ini didownload otomatis karena tab Meet ditutup / meeting berhenti sebelum kamu sempat klik "Stop & Summarize". Belum ada ringkasan AI, tapi transkrip lengkapnya ada di bawah.',
    transcriptHeader: "--- TRANSKRIP LENGKAP ---",
    dateLabel: "Tanggal",
    locale: "id-ID",
  },
  en: {
    header: "=== MEETING NOTES (auto-save) ===",
    note: 'This file was downloaded automatically because the Meet tab closed / the meeting ended before you clicked "Stop & Summarize". No AI summary yet, but the full transcript is below.',
    transcriptHeader: "--- FULL TRANSCRIPT ---",
    dateLabel: "Date",
    locale: "en-US",
  },
};

function buildAutoSaveText(transcript, lang) {
  const s = AUTOSAVE_STRINGS[lang];
  const header = `${s.header}\n${s.dateLabel}: ${new Date().toLocaleString(
    s.locale
  )}\n\n${s.note}\n\n${s.transcriptHeader}\n`;

  const body = transcript
    .map(
      (line) =>
        `[${new Date(line.timestamp).toLocaleTimeString(s.locale)}] ${
          line.speaker
        }: ${line.text}`
    )
    .join("\n");

  return header + body;
}

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function downloadTextFileFromBackground(text, filename) {
  // Service worker nggak selalu punya URL.createObjectURL, jadi pakai data URL.
  const dataUrl = `data:text/plain;charset=utf-8;base64,${toBase64Utf8(text)}`;
  chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
}

function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(
    2,
    "0"
  )}${String(d.getMinutes()).padStart(2, "0")}`;
}

async function validateApiKey(apiKey) {
  if (!apiKey) return { ok: false, error: "empty_key" };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (response.ok) return { ok: true };

    const errText = await response.text();
    return { ok: false, error: `${response.status} - ${errText}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

const LANGUAGE_NAMES = {
  id: "Indonesian",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  ja: "Japanese",
  zh: "Simplified Chinese",
  ko: "Korean",
  pt: "Portuguese",
  ar: "Arabic",
};

async function summarizeWithGemini(apiKey, transcriptLines, lang) {
  const numberedText = transcriptLines
    .map((line, i) => `${i + 1}. ${line.speaker}: ${line.text}`)
    .join("\n");

  const languageName = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES.id;

  const prompt = `Below is a meeting transcript captured from live captions (formatted as "index. Name: utterance" per line). Because it comes from auto-generated captions, it may contain speech-to-text errors: misheard/garbled words, duplicated fragments, or awkward cut-offs.

Produce TWO things, using EXACTLY these section markers and nothing else before/after them:

===SUMMARY===
1. A short SUMMARY (3-6 sentences) of the main topics discussed
2. KEY POINTS (bullet list)
3. ACTION ITEMS, grouped by person (if any tasks/follow-ups were mentioned). If there are no clear action items, say so explicitly.
Respond entirely in ${languageName}, regardless of what language the transcript is in. Plain text only (no markdown asterisks or heavy headings).

===TRANSCRIPT===
The same transcript, cleaned up. Live captions frequently mangle vocabulary: misheard/garbled words, wrong technical terms or jargon, mistranscribed names, and broken code-switching (many meetings mix Indonesian and English terms, e.g. "timeline", "deadline", "align", "planning"). Use the surrounding lines and overall topic of the conversation as context to figure out what word was actually meant, and fix it to the correct/clear vocabulary in that context, not just literal near-matches of the garbled sound. If a proper noun, product name, or jargon term shows up garbled in several lines, normalize it to the same corrected spelling everywhere once you can infer it from context. Keep the original meaning, speaker names, and each line's original language intact (fix unclear words, don't rewrite the whole sentence or translate it). Do not summarize or add/remove information that wasn't implied by the line itself.
Rules:
- Output exactly ${transcriptLines.length} lines, one per input line, same order, same "index. Name: utterance" format.
- Never merge two input lines into one, and never split one input line into two.
- If a line already looks correct and unambiguous, keep it unchanged.

TRANSCRIPT:
${numberedText}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini did not return a summary result.");

  const summaryMatch = rawText.match(/===SUMMARY===([\s\S]*?)===TRANSCRIPT===/);
  const transcriptMatch = rawText.match(/===TRANSCRIPT===([\s\S]*)$/);

  const summary = summaryMatch ? summaryMatch[1].trim() : rawText.trim();
  const correctedTranscript = transcriptMatch
    ? parseCorrectedTranscript(transcriptMatch[1], transcriptLines)
    : transcriptLines;

  return { summary, correctedTranscript };
}

function parseCorrectedTranscript(block, originalLines) {
  const lineRe = /^\s*(\d+)\.\s*([^:]+):\s*(.*)$/;
  const corrected = new Map();

  block.split("\n").forEach((rawLine) => {
    const m = rawLine.match(lineRe);
    if (!m) return;
    corrected.set(Number(m[1]) - 1, { speaker: m[2].trim(), text: m[3].trim() });
  });

  // Kalau modelnya nggak ngikutin format / jumlah baris meleset jauh, lebih
  // aman balikin transkrip asli daripada risiko kehilangan/ngaco datanya.
  if (corrected.size < originalLines.length * 0.7) return originalLines;

  return originalLines.map((line, i) => {
    const fix = corrected.get(i);
    if (!fix || !fix.text) return line;
    return { ...line, speaker: fix.speaker || line.speaker, text: fix.text };
  });
}
