// popup.js

const apiKeyInput = document.getElementById("apiKey");
const durationDisplay = document.getElementById("durationDisplay");
const durationLabel = document.getElementById("durationLabel");
const charDisplay = document.getElementById("charDisplay");
const statusEl = document.getElementById("status");
const langIdBtn = document.getElementById("langId");
const langEnBtn = document.getElementById("langEn");
const themeLightBtn = document.getElementById("themeLight");
const themeDarkBtn = document.getElementById("themeDark");
const summaryLangSelect = document.getElementById("summaryLang");

const startBtn = document.getElementById("startBtn");
const startHintEl = document.getElementById("startHint");
const refreshBtn = document.getElementById("refreshBtn");
const summarizeBtn = document.getElementById("summarizeBtn");
const clearBtn = document.getElementById("clearBtn");

const GITHUB_URL = "https://github.com/tinoimammp/google-meet-ai-notes";

let durationIntervalId = null;
let currentLang = "id";
let hasStarted = false; // dipakai buat tau apakah durationLabel harus "belum dimulai" / "sedang berjalan"

const STRINGS = {
  id: {
    tagline: "live transcript &middot; Google Meet",
    apiKeyLabel: "Gemini API key",
    apiHintPrefix: "Belum punya?",
    apiHintLink: "Ambil gratis di Google AI Studio &rarr;",
    summaryLangLabel: "Ringkasan dalam bahasa",
    notStarted: "belum dimulai",
    running: "sedang berjalan",
    charactersLabel: "Karakter",
    startBtn: "Start (aktifkan caption)",
    refreshBtn: "Refresh",
    summarizeBtn: "Stop &amp; Summarize (.txt)",
    clearBtn: "Clear transkrip",
    statusActivatingCaption: "Mengaktifkan caption...",
    statusNoActiveTab: "Tidak menemukan tab aktif.",
    notOnMeetPage: "Buka tab Google Meet dulu untuk memakai extension ini.",
    statusConnectFail:
      "Gagal terhubung ke tab Meet. Pastikan kamu sedang berada di halaman meet.google.com dan reload tab-nya.",
    statusToggleNotFound: "Tombol caption tidak ditemukan di halaman ini.",
    statusCaptionEnabled: "Caption diaktifkan. Mulai mencatat...",
    statusCaptionAlreadyOn: "Caption sudah aktif. Siap mencatat.",
    statusUpdated: "Diperbarui.",
    statusCleared: "Transkrip & durasi direset.",
    statusNeedApiKey: "Isi Gemini API key dulu.",
    startHintNeedApiKey: "Isi Gemini API key di atas dulu buat mengaktifkan tombol ini.",
    startHintNotOnMeet: "Buka tab Google Meet dulu buat mengaktifkan tombol ini.",
    statusValidatingApiKey: "Memvalidasi API key...",
    statusInvalidApiKey: (err) => `API key tidak valid: ${err}`,
    statusFallbackSaved:
      "Ringkasan AI gagal dibuat, tapi transkrip tetap disimpan sebagai .txt.",
    fallbackSummaryNote: (err) =>
      `Ringkasan otomatis tidak berhasil dibuat (kemungkinan API key tidak valid, kuota habis, atau ada gangguan koneksi). Detail error: ${err}\n\nTranskrip lengkap tetap disertakan di bawah ini.`,
    statusFetchingTranscript: "Mengambil transkrip...",
    statusEmptyTranscript: "Belum ada transkrip yang tertangkap.",
    statusSummarizing: (n) => `Merangkum ${n} baris dengan Gemini...`,
    statusFailed: (err) => `Gagal: ${err}`,
    statusDone: "Selesai! File .txt sedang didownload.",
    notesHeader: "=== MEETING NOTES ===",
    notesDateLabel: "Tanggal",
    notesSummaryHeader: "--- RINGKASAN & ACTION ITEMS ---",
    notesTranscriptHeader: "--- TRANSKRIP LENGKAP ---",
    locale: "id-ID",
  },
  en: {
    tagline: "live transcript &middot; Google Meet",
    apiKeyLabel: "Gemini API key",
    apiHintPrefix: "Don't have one?",
    apiHintLink: "Get one free at Google AI Studio &rarr;",
    summaryLangLabel: "Summarize in",
    notStarted: "not started",
    running: "running",
    charactersLabel: "Characters",
    startBtn: "Start (enable captions)",
    refreshBtn: "Refresh",
    summarizeBtn: "Stop &amp; Summarize (.txt)",
    clearBtn: "Clear transcript",
    statusActivatingCaption: "Enabling captions...",
    statusNoActiveTab: "No active tab found.",
    notOnMeetPage: "Open a Google Meet tab to use this extension.",
    statusConnectFail:
      "Couldn't connect to the Meet tab. Make sure you're on meet.google.com and reload the tab.",
    statusToggleNotFound: "Caption toggle button not found on this page.",
    statusCaptionEnabled: "Captions enabled. Now taking notes...",
    statusCaptionAlreadyOn: "Captions already on. Ready to take notes.",
    statusUpdated: "Updated.",
    statusCleared: "Transcript & timer reset.",
    statusNeedApiKey: "Enter your Gemini API key first.",
    startHintNeedApiKey: "Enter your Gemini API key above to enable this button.",
    startHintNotOnMeet: "Open a Google Meet tab to enable this button.",
    statusValidatingApiKey: "Validating API key...",
    statusInvalidApiKey: (err) => `Invalid API key: ${err}`,
    statusFallbackSaved:
      "AI summary failed, but the transcript was still saved as a .txt.",
    fallbackSummaryNote: (err) =>
      `The automatic summary could not be generated (likely an invalid API key, exhausted quota, or a connection issue). Error detail: ${err}\n\nThe full transcript is still included below.`,
    statusFetchingTranscript: "Fetching transcript...",
    statusEmptyTranscript: "No transcript captured yet.",
    statusSummarizing: (n) => `Summarizing ${n} lines with Gemini...`,
    statusFailed: (err) => `Failed: ${err}`,
    statusDone: "Done! Your .txt file is downloading.",
    notesHeader: "=== MEETING NOTES ===",
    notesDateLabel: "Date",
    notesSummaryHeader: "--- SUMMARY & ACTION ITEMS ---",
    notesTranscriptHeader: "--- FULL TRANSCRIPT ---",
    locale: "en-US",
  },
};

function t(key, ...args) {
  const entry = STRINGS[currentLang][key];
  return typeof entry === "function" ? entry(...args) : entry;
}

function applyStaticTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const value = STRINGS[currentLang][key];
    if (typeof value === "string") el.innerHTML = value;
  });
  durationLabel.textContent = hasStarted ? t("running") : t("notStarted");
  updateStartButtonState();
  setControlsEnabled(isOnMeet);
}

function setLanguage(lang) {
  currentLang = lang;
  langIdBtn.classList.toggle("active", lang === "id");
  langEnBtn.classList.toggle("active", lang === "en");
  chrome.storage.local.set({ uiLang: lang });
  applyStaticTranslations();
}

langIdBtn.addEventListener("click", () => setLanguage("id"));
langEnBtn.addEventListener("click", () => setLanguage("en"));

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeLightBtn.classList.toggle("active", theme === "light");
  themeDarkBtn.classList.toggle("active", theme === "dark");
  chrome.storage.local.set({ uiTheme: theme });
}

themeLightBtn.addEventListener("click", () => setTheme("light"));
themeDarkBtn.addEventListener("click", () => setTheme("dark"));

// Load API key, bahasa menu, bahasa ringkasan, & tema tersimpan (independen satu sama lain)
chrome.storage.local.get(
  ["geminiApiKey", "uiLang", "summaryLang", "uiTheme"],
  (result) => {
    if (result.geminiApiKey) apiKeyInput.value = result.geminiApiKey;
    setLanguage(result.uiLang === "en" ? "en" : "id");
    summaryLangSelect.value = result.summaryLang || "id";
    setTheme(result.uiTheme === "dark" ? "dark" : "light");
    updateStartButtonState();
  }
);

summaryLangSelect.addEventListener("change", () => {
  chrome.storage.local.set({ summaryLang: summaryLangSelect.value });
});

apiKeyInput.addEventListener("change", () => {
  chrome.storage.local.set({ geminiApiKey: apiKeyInput.value.trim() });
});

function setStatus(text) {
  statusEl.textContent = text;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

function getActiveTabId(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    callback(tabs[0]?.id || null);
  });
}

function storageKeyFor(tabId) {
  return `captureStart_${tabId}`;
}

function refreshCharCount() {
  chrome.runtime.sendMessage({ type: "GET_TRANSCRIPT" }, (response) => {
    const transcript = response?.transcript || [];
    const totalChars = transcript.reduce(
      (sum, line) => sum + (line.text?.length || 0),
      0
    );
    charDisplay.textContent = totalChars.toLocaleString(STRINGS[currentLang].locale);
  });
}

function startDurationClock(tabId) {
  if (durationIntervalId) clearInterval(durationIntervalId);

  chrome.storage.local.get([storageKeyFor(tabId)], (result) => {
    const startTime = result[storageKeyFor(tabId)];

    if (!startTime) {
      hasStarted = false;
      durationDisplay.textContent = "00:00";
      durationLabel.textContent = t("notStarted");
      refreshCharCount();
      return;
    }

    hasStarted = true;
    durationLabel.textContent = t("running");

    const tick = () => {
      durationDisplay.textContent = formatDuration(Date.now() - startTime);
      refreshCharCount();
    };
    tick();
    durationIntervalId = setInterval(tick, 1000);
  });
}

function resetDurationClock(tabId) {
  chrome.storage.local.remove(storageKeyFor(tabId), () => {
    if (durationIntervalId) clearInterval(durationIntervalId);
    hasStarted = false;
    durationDisplay.textContent = "00:00";
    durationLabel.textContent = t("notStarted");
    charDisplay.textContent = "0";
  });
}

function flushActiveTab(callback) {
  getActiveTabId((activeTabId) => {
    if (!activeTabId) {
      callback();
      return;
    }
    chrome.tabs.sendMessage(activeTabId, { type: "FORCE_FLUSH" }, () => {
      void chrome.runtime.lastError;
      callback();
    });
  });
}

startBtn.addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus(t("statusNeedApiKey"));
    return;
  }

  setStatus(t("statusValidatingApiKey"));
  chrome.runtime.sendMessage(
    { type: "VALIDATE_API_KEY", payload: { apiKey } },
    (validation) => {
      if (!validation?.ok) {
        setStatus(t("statusInvalidApiKey", validation?.error || "unknown"));
        return;
      }
      proceedStart();
    }
  );
});

function proceedStart() {
  setStatus(t("statusActivatingCaption"));
  getActiveTabId((activeTabId) => {
    if (!activeTabId) {
      setStatus(t("statusNoActiveTab"));
      return;
    }
    chrome.tabs.sendMessage(
      activeTabId,
      { type: "ENSURE_CAPTIONS_ON" },
      (result) => {
        if (chrome.runtime.lastError) {
          setStatus(t("statusConnectFail"));
          return;
        }
        if (!result?.found) {
          setStatus(t("statusToggleNotFound"));
          return;
        }

        const key = storageKeyFor(activeTabId);
        chrome.storage.local.get([key], (existing) => {
          if (!existing[key]) {
            chrome.storage.local.set({ [key]: Date.now() }, () => {
              startDurationClock(activeTabId);
            });
          } else {
            startDurationClock(activeTabId);
          }
        });

        setStatus(
          result.clicked
            ? t("statusCaptionEnabled")
            : t("statusCaptionAlreadyOn")
        );

        const chatText = `This meeting is summarized by Meetly AI Notes — ${GITHUB_URL}`;

        chrome.tabs.sendMessage(
          activeTabId,
          { type: "SEND_CHAT_MESSAGE", payload: { text: chatText } },
          (chatResult) => {
            if (chrome.runtime.lastError || !chatResult?.ok) {
              console.warn(
                "Gagal kirim pesan chat:",
                chatResult?.reason || chrome.runtime.lastError
              );
            }
          }
        );
      }
    );
  });
}

refreshBtn.addEventListener("click", () => {
  flushActiveTab(() => {
    getActiveTabId((activeTabId) => {
      if (activeTabId) startDurationClock(activeTabId);
    });
    setStatus(t("statusUpdated"));
  });
});

clearBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_TRANSCRIPT" }, () => {
    getActiveTabId((activeTabId) => {
      if (activeTabId) resetDurationClock(activeTabId);
    });
    setStatus(t("statusCleared"));
  });
});

summarizeBtn.addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus(t("statusNeedApiKey"));
    return;
  }

  setStatus(t("statusFetchingTranscript"));

  flushActiveTab(() => {
    chrome.runtime.sendMessage({ type: "GET_TRANSCRIPT" }, (response) => {
      const transcript = response?.transcript || [];
      if (transcript.length === 0) {
        setStatus(t("statusEmptyTranscript"));
        return;
      }

      setStatus(t("statusSummarizing", transcript.length));

      chrome.runtime.sendMessage(
        {
          type: "SUMMARIZE",
          payload: { apiKey, transcript, lang: summaryLangSelect.value },
        },
        (result) => {
          if (!result?.ok) {
            // Fallback: tetap simpan transkrip lengkap walau ringkasan AI gagal
            const fallbackSummary = t(
              "fallbackSummaryNote",
              result?.error || "unknown error"
            );
            const finalText = buildFinalText(transcript, fallbackSummary);
            downloadTextFile(finalText, `meeting-notes-${dateStamp()}.txt`);
            setStatus(t("statusFallbackSaved"));
            return;
          }

          const finalText = buildFinalText(transcript, result.summary);
          downloadTextFile(finalText, `meeting-notes-${dateStamp()}.txt`);
          setStatus(t("statusDone"));
        }
      );
    });
  });
});

function buildFinalText(transcript, summary) {
  const locale = STRINGS[currentLang].locale;
  const header = `${t("notesHeader")}\n${t(
    "notesDateLabel"
  )}: ${new Date().toLocaleString(locale)}\n\n${t(
    "notesSummaryHeader"
  )}\n${summary}\n\n${t("notesTranscriptHeader")}\n`;

  const fullTranscript = transcript
    .map(
      (line) =>
        `[${new Date(line.timestamp).toLocaleTimeString(locale)}] ${
          line.speaker
        }: ${line.text}`
    )
    .join("\n");

  return header + fullTranscript;
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () =>
    URL.revokeObjectURL(url)
  );
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

function isOnMeetTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || "";
    callback(url.startsWith("https://meet.google.com/"));
  });
}

const actionButtons = [refreshBtn, summarizeBtn, clearBtn];

function setControlsEnabled(enabled) {
  const reason = enabled ? "" : t("notOnMeetPage");
  actionButtons.forEach((btn) => {
    btn.disabled = !enabled;
    btn.title = reason;
  });
}

let isOnMeet = false;

function updateStartButtonState() {
  const hasApiKey = apiKeyInput.value.trim().length > 0;
  startBtn.disabled = !(isOnMeet && hasApiKey);

  if (!isOnMeet) {
    startHintEl.textContent = t("startHintNotOnMeet");
    startBtn.title = t("startHintNotOnMeet");
  } else if (!hasApiKey) {
    startHintEl.textContent = t("startHintNeedApiKey");
    startBtn.title = t("startHintNeedApiKey");
  } else {
    startHintEl.textContent = "";
    startBtn.title = "";
  }
}

apiKeyInput.addEventListener("input", updateStartButtonState);

getActiveTabId((activeTabId) => {
  if (activeTabId) startDurationClock(activeTabId);
});

isOnMeetTab((onMeet) => {
  isOnMeet = onMeet;
  setControlsEnabled(onMeet);
  updateStartButtonState();
  if (!onMeet) {
    setStatus(t("notOnMeetPage"));
  }
});
