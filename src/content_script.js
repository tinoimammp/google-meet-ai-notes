// content_script.js
// Runs on meet.google.com
// Scrapes Google Meet's live caption UI: speaker name + spoken text.
//
// Approach: per-block debounce. Meet keeps appending text to the same
// caption block while a speaker keeps talking (rather than creating a new
// block per sentence). We treat a block as "finished" once its text stops
// changing for FINALIZE_DELAY_MS, then push the new portion of text to the
// transcript.

(function () {
  const POSSIBLE_ARIA_LABELS = ["Teks", "Captions", "Legendas", "Subtítulos"];
  const BLOCK_SELECTOR = ".nMcdL";
  const NAME_SELECTOR = ".NWpY1d";
  const TEXT_SELECTOR = ".ygicle";
  const FINALIZE_DELAY_MS = 1200;

  const POSSIBLE_TOGGLE_LABELS = [
    "Turn on captions",
    "Turn off captions",
    "Aktifkan teks",
    "Nonaktifkan teks",
  ];

  // Per DOM block: { speaker, fullText, lastPushedText, timer }
  const blockState = new WeakMap();

  // All blocks ever seen, so we can force-finalize pending ones on demand.
  const trackedBlocks = new Set();

  function findCaptionContainer() {
    for (const label of POSSIBLE_ARIA_LABELS) {
      const el = document.querySelector(`[aria-label="${label}"]`);
      if (el) return el;
    }
    // Fallback: any region that already contains a caption block.
    const regions = document.querySelectorAll('[role="region"]');
    for (const region of regions) {
      if (region.querySelector(BLOCK_SELECTOR)) return region;
    }
    return null;
  }

  function pushFinal(speaker, newPart) {
    const trimmed = newPart.trim();
    if (!trimmed) return;

    chrome.runtime.sendMessage({
      type: "CAPTION_LINE_FINAL",
      payload: { speaker, text: trimmed, timestamp: Date.now() },
    });
  }

  function finalizeBlockNow(block) {
    const state = blockState.get(block);
    if (!state) return;

    const full = state.fullText;
    const prev = state.lastPushedText || "";

    let newPart;
    if (full.startsWith(prev)) {
      // Normal case: text only grows from the end.
      newPart = full.slice(prev.length);
    } else {
      // Meet occasionally trims/resets text from the front to keep the
      // caption box compact. Treat the whole visible text as new rather
      // than risk losing content (may duplicate a few words at the seam).
      newPart = full;
    }

    if (newPart.trim()) {
      pushFinal(state.speaker, newPart);
    }
    state.lastPushedText = full;
  }

  function scanBlocks() {
    const container = findCaptionContainer();
    if (!container) return;

    const currentBlocks = new Set(container.querySelectorAll(BLOCK_SELECTOR));

    currentBlocks.forEach((block) => {
      const nameEl = block.querySelector(NAME_SELECTOR);
      const textEl = block.querySelector(TEXT_SELECTOR);
      if (!nameEl || !textEl) return;

      const speaker = nameEl.textContent.trim();
      const fullText = textEl.textContent;

      let state = blockState.get(block);

      if (!state) {
        state = {
          speaker,
          fullText: "",
          lastPushedText: "",
          timer: null,
        };
        blockState.set(block, state);
        trackedBlocks.add(block);
      }

      if (fullText !== state.fullText) {
        state.speaker = speaker;
        state.fullText = fullText;

        if (state.timer) clearTimeout(state.timer);
        state.timer = setTimeout(() => {
          finalizeBlockNow(block);
        }, FINALIZE_DELAY_MS);
      }
    });
  }

  function findCaptionToggleButton() {
    for (const label of POSSIBLE_TOGGLE_LABELS) {
      const btn = document.querySelector(`button[aria-label="${label}"]`);
      if (btn) return btn;
    }
    return null;
  }

  function ensureCaptionsOn() {
    const btn = findCaptionToggleButton();
    if (!btn) {
      return { found: false, wasOn: false, clicked: false };
    }
    const label = btn.getAttribute("aria-label").toLowerCase();
    const isOff = label.includes("turn on") || label.includes("aktifkan teks");

    if (isOff) {
      btn.click();
      return { found: true, wasOn: false, clicked: true };
    }
    return { found: true, wasOn: true, clicked: false };
  }

  const POSSIBLE_CHAT_TOGGLE_LABELS = [
    "Chat with everyone",
    "Obrolan dengan semua orang",
  ];

  function findChatToggleButton() {
    for (const label of POSSIBLE_CHAT_TOGGLE_LABELS) {
      const btn = document.querySelector(`button[aria-label="${label}"]`);
      if (btn) return btn;
    }
    return null;
  }

  function findChatTextarea() {
    return document.querySelector('textarea[aria-label="Send a message"]');
  }

  function findChatSendButton() {
    return document.querySelector('button[aria-label="Send a message"]');
  }

  function setNativeValue(element, value) {
    // React-controlled textarea butuh native value setter, bukan
    // element.value = ... langsung (React tidak akan mendeteksi
    // perubahannya kalau di-set dengan cara biasa).
    const proto = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    descriptor.set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function sendChatMessage(message) {
    let textarea = findChatTextarea();

    if (!textarea) {
      const chatBtn = findChatToggleButton();
      if (!chatBtn) return { ok: false, reason: "chat_button_not_found" };
      chatBtn.click();
      await new Promise((r) => setTimeout(r, 500));
      textarea = findChatTextarea();
      if (!textarea) return { ok: false, reason: "textarea_not_found" };
    }

    textarea.focus();
    setNativeValue(textarea, message);

    // Beri waktu React mendeteksi perubahan sebelum tombol send aktif
    await new Promise((r) => setTimeout(r, 200));

    const sendBtn = findChatSendButton();
    if (!sendBtn || sendBtn.disabled) {
      return { ok: false, reason: "send_button_not_ready" };
    }
    sendBtn.click();
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "FORCE_FLUSH") {
      trackedBlocks.forEach((block) => {
        const state = blockState.get(block);
        if (state?.timer) clearTimeout(state.timer);
        finalizeBlockNow(block);
      });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "ENSURE_CAPTIONS_ON") {
      sendResponse(ensureCaptionsOn());
      return;
    }

    if (message.type === "SEND_CHAT_MESSAGE") {
      sendChatMessage(message.payload.text).then(sendResponse);
      return true; // async response
    }
  });

  function start() {
    const container = findCaptionContainer();
    if (!container) {
      // Captions may not be turned on yet, or Meet hasn't rendered the
      // region yet. Keep polling until it appears.
      setTimeout(start, 2000);
      return;
    }

    const observer = new MutationObserver(scanBlocks);
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    scanBlocks();
  }

  start();
})();
