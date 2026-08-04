// background.js

// Simpan transkrip per tabId, biar kalau ada beberapa meeting sekaligus nggak ketuker
const transcripts = {}; // { [tabId]: [{ speaker, text, timestamp }] }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;

  if (message.type === "CAPTION_LINE_FINAL" && tabId !== null) {
    if (!transcripts[tabId]) transcripts[tabId] = [];
    transcripts[tabId].push(message.payload);
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
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "SUMMARIZE") {
    const { apiKey, transcript, lang } = message.payload;
    summarizeWithGemini(apiKey, transcript, lang || "id")
      .then((summary) => sendResponse({ ok: true, summary }))
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

// Bersihkan transkrip kalau tab ditutup
chrome.tabs.onRemoved.addListener((tabId) => {
  delete transcripts[tabId];
  chrome.storage.local.remove(`captureStart_${tabId}`);
});

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
  const transcriptText = transcriptLines
    .map((line) => `${line.speaker}: ${line.text}`)
    .join("\n");

  const languageName = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES.id;

  const prompt = `Below is a meeting transcript, formatted as "Name: utterance" per line. The transcript itself may be in any language.

Please produce:
1. A short SUMMARY (3-6 sentences) of the main topics discussed
2. KEY POINTS (bullet list)
3. ACTION ITEMS, grouped by person (if any tasks/follow-ups were mentioned). If there are no clear action items, say so explicitly.

Respond entirely in ${languageName}, regardless of what language the transcript is in. Plain text only (no markdown asterisks or heavy headings), ready to paste directly into a .txt file.

TRANSCRIPT:
${transcriptText}`;

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
  const summaryText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!summaryText) throw new Error("Gemini did not return a summary result.");
  return summaryText;
}
