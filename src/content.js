(function initBandMattermostStickers() {
  const ROOT_ID = "band-stickers-root";
  const BUTTON_ID = "band-stickers-button";
  const PANEL_ID = "band-stickers-panel";
  const INSTANT_SEND_CHECKBOX_ID = "band-stickers-instant-send";
  const BIG_STICKER_CHECKBOX_ID = "band-stickers-bigstic";
  const POPULAR_PACK_ID = "popular";
  const USAGE_STORAGE_KEY = "band-stickers-usage-v1";
  const POPULAR_STICKERS_LIMIT = 24;
  const STATUS_TIMEOUT_MS = 2800;
  const COMPOSER_PRIME_CHARACTER = "\u200B";
  const SEND_TIMEOUT_MS = 5000;
  const packs = window.BAND_STICKER_PACKS || [];

  let activeInput = null;
  let activePackId = POPULAR_PACK_ID;
  let instantSendEnabled = true;
  let bigStickerEnabled = false;
  let globalListenersAttached = false;
  let statusTimer = null;

  function findComposerInput() {
    return (
      document.querySelector("#post_textbox") ||
      document.querySelector("[data-testid='post_textbox']") ||
      document.querySelector("textarea[aria-label*='message' i]") ||
      document.querySelector("div[contenteditable='true'][role='textbox']")
    );
  }

  function findComposerContainer(input) {
    if (!input) {
      return null;
    }

    return (
      input.closest("#create_post") ||
      input.closest(".post-textbox__container") ||
      input.closest(".post-create__container") ||
      input.closest("form") ||
      input.parentElement
    );
  }

  function findComposerActionRow(input) {
    const container = findComposerContainer(input);
    if (!container) {
      return null;
    }

    const emojiButton =
      container.querySelector("#emojiPickerButton") ||
      container.querySelector("[data-testid='emojiPickerButton']") ||
      container.querySelector("button[aria-label*='emoji' i]") ||
      document.querySelector("#emojiPickerButton, [data-testid='emojiPickerButton']");

    const uploadButton =
      container.querySelector("#fileUploadButton") ||
      container.querySelector("[data-testid='fileUploadButton']") ||
      container.querySelector("button[aria-label*='file' i]") ||
      container.querySelector("button[aria-label*='upload' i]") ||
      container.querySelector("input[type='file']")?.closest("button, label, div") ||
      document.querySelector("#fileUploadButton, [data-testid='fileUploadButton']");

    if (emojiButton?.parentElement && uploadButton?.parentElement === emojiButton.parentElement) {
      return {
        row: emojiButton.parentElement,
        before: uploadButton,
        after: emojiButton
      };
    }

    if (emojiButton?.parentElement) {
      return {
        row: emojiButton.parentElement,
        before: emojiButton.nextElementSibling,
        after: emojiButton
      };
    }

    const fallbackRow =
      container.querySelector(".post-create__actions") ||
      container.querySelector(".post-textbox__actions") ||
      container.querySelector(".post-create-footer") ||
      container;

    return {
      row: fallbackRow,
      before: null,
      after: null
    };
  }

  function stickersForPack(pack) {
    return pack.stickers.map((sticker) => ({
      ...sticker,
      packId: pack.id,
      packTitle: pack.title
    }));
  }

  function getAllStickers() {
    return packs.flatMap((pack) => stickersForPack(pack));
  }

  function readUsageStats() {
    try {
      return JSON.parse(localStorage.getItem(USAGE_STORAGE_KEY) || "{}");
    } catch (error) {
      console.warn("[Band Stickers] Failed to read usage stats", error);
      return {};
    }
  }

  function writeUsageStats(stats) {
    try {
      localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(stats));
    } catch (error) {
      console.warn("[Band Stickers] Failed to write usage stats", error);
    }
  }

  function trackStickerUsage(sticker) {
    const stats = readUsageStats();
    const current = stats[sticker.id] || { count: 0, lastUsedAt: 0 };

    stats[sticker.id] = {
      count: current.count + 1,
      lastUsedAt: Date.now()
    };

    writeUsageStats(stats);
  }

  function getPopularStickers() {
    const stats = readUsageStats();

    return getAllStickers()
      .filter((sticker) => stats[sticker.id]?.count > 0)
      .sort((left, right) => {
        const leftStats = stats[left.id];
        const rightStats = stats[right.id];
        return (
          rightStats.count - leftStats.count ||
          rightStats.lastUsedAt - leftStats.lastUsedAt ||
          left.title.localeCompare(right.title)
        );
      })
      .slice(0, POPULAR_STICKERS_LIMIT);
  }

  function getPackButtonId(packId) {
    return `band-stickers-pack-${packId}`;
  }

  function getPackTabs() {
    return [
      {
        id: POPULAR_PACK_ID,
        title: "Популярные"
      },
      ...packs
    ];
  }

  function createStickerButton(sticker) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "band-sticker-item";
    item.title = sticker.title;
    item.setAttribute("aria-label", sticker.title);
    item.dataset.stickerPath = sticker.path;
    item.dataset.stickerId = sticker.id;

    const image = document.createElement("img");
    image.alt = sticker.title;
    image.loading = "lazy";
    image.src = extensionUrl(sticker.path);

    item.append(image);
    item.addEventListener("click", () => sendSticker(sticker));

    return item;
  }

  function renderPack(panel, packId) {
    const grid = panel.querySelector(".band-stickers-grid");

    if (!grid) {
      return;
    }

    const selectedPack = packs.find((pack) => pack.id === packId);
    const normalizedPackId = packId === POPULAR_PACK_ID || selectedPack ? packId : POPULAR_PACK_ID;
    const stickers = normalizedPackId === POPULAR_PACK_ID
      ? getPopularStickers()
      : stickersForPack(selectedPack);

    activePackId = normalizedPackId;

    if (stickers.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "band-stickers-empty";
      emptyState.textContent = "Здесь появятся часто используемые стикеры";
      grid.replaceChildren(emptyState);
    } else {
      grid.replaceChildren(
        ...stickers.map((sticker) => createStickerButton(sticker))
      );
    }

    for (const packButton of panel.querySelectorAll(".band-stickers-pack")) {
      const isActive = packButton.dataset.packId === normalizedPackId;
      packButton.classList.toggle("is-active", isActive);
      packButton.setAttribute("aria-selected", String(isActive));
      packButton.tabIndex = isActive ? 0 : -1;
    }
  }

  function extensionUrl(path) {
    return chrome.runtime.getURL(path);
  }

  function closePanel() {
    const panel = document.getElementById(PANEL_ID);
    const button = document.getElementById(BUTTON_ID);
    if (panel) {
      panel.hidden = true;
    }
    if (button) {
      button.setAttribute("aria-expanded", "false");
    }
  }

  function openPanel() {
    const panel = document.getElementById(PANEL_ID) || createPanel();
    const button = document.getElementById(BUTTON_ID);

    if (!panel) {
      return;
    }

    panel.hidden = false;
    if (button) {
      button.setAttribute("aria-expanded", "true");
    }
    positionPanel();
  }

  function togglePanelState() {
    const panel = document.getElementById(PANEL_ID) || createPanel();
    const button = document.getElementById(BUTTON_ID);

    if (!panel) {
      return;
    }

    panel.hidden = !panel.hidden;
    if (button) {
      button.setAttribute("aria-expanded", String(!panel.hidden));
    }

    if (!panel.hidden) {
      positionPanel();
    }
  }

  function positionPanel() {
    const button = document.getElementById(BUTTON_ID);
    const panel = document.getElementById(PANEL_ID);

    if (!button || !panel || panel.hidden) {
      return;
    }

    const buttonRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const margin = 12;
    const centeredLeft = buttonRect.left + buttonRect.width / 2 - panelRect.width / 2;
    const clampedLeft = Math.max(
      margin,
      Math.min(centeredLeft, window.innerWidth - panelRect.width - margin)
    );
    const topAbove = buttonRect.top - panelRect.height - 10;
    const topBelow = buttonRect.bottom + 10;
    const top = topAbove > margin ? topAbove : topBelow;

    panel.style.left = `${Math.round(clampedLeft)}px`;
    const clampedTop = Math.max(
      margin,
      Math.min(top, window.innerHeight - panelRect.height - margin)
    );

    panel.style.top = `${Math.round(clampedTop)}px`;
  }

  function createPanel() {
    document.querySelectorAll(`#${PANEL_ID}`).forEach((existingPanel) => existingPanel.remove());

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.setAttribute("aria-label", "Выбор стикера");
    panel.addEventListener("pointerdown", stopMattermostEvent);
    panel.addEventListener("click", stopMattermostEvent);

    const header = document.createElement("div");
    header.className = "band-stickers-header";

    const title = document.createElement("div");
    title.className = "band-stickers-title";
    title.textContent = "Стикеры";

    header.append(title);

    const body = document.createElement("div");
    body.className = "band-stickers-body";

    const packList = document.createElement("div");
    packList.className = "band-stickers-packs";
    packList.setAttribute("role", "tablist");
    packList.setAttribute("aria-label", "Папки стикеров");

    for (const pack of getPackTabs()) {
      const packButton = document.createElement("button");
      packButton.type = "button";
      packButton.className = "band-stickers-pack";
      packButton.dataset.packId = pack.id;
      packButton.setAttribute("role", "tab");
      packButton.id = getPackButtonId(pack.id);

      const packName = document.createElement("span");
      packName.textContent = pack.title;

      packButton.append(packName);
      packButton.addEventListener("click", () => renderPack(panel, pack.id));
      packList.append(packButton);
    }

    const grid = document.createElement("div");
    grid.className = "band-stickers-grid";
    body.append(packList, grid);

    const status = document.createElement("div");
    status.className = "band-stickers-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const instantSendInput = document.createElement("input");
    instantSendInput.id = INSTANT_SEND_CHECKBOX_ID;
    instantSendInput.type = "checkbox";
    instantSendInput.checked = instantSendEnabled;
    instantSendInput.addEventListener("change", () => {
      instantSendEnabled = instantSendInput.checked;
    });

    const instantSendLabel = createFooterCheckbox(
      instantSendInput,
      "Моментальная отправка"
    );

    const bigStickerInput = document.createElement("input");
    bigStickerInput.id = BIG_STICKER_CHECKBOX_ID;
    bigStickerInput.type = "checkbox";
    bigStickerInput.checked = bigStickerEnabled;
    bigStickerInput.addEventListener("change", () => {
      bigStickerEnabled = bigStickerInput.checked;
    });

    const bigStickerLabel = createFooterCheckbox(bigStickerInput, "bigstic");

    const options = document.createElement("div");
    options.className = "band-stickers-options";
    options.append(instantSendLabel, bigStickerLabel);

    const footer = document.createElement("div");
    footer.className = "band-stickers-footer";
    footer.append(options, status);

    document.body.append(panel);
    panel.append(header, body, footer);
    renderPack(panel, activePackId);

    return panel;
  }

  function createFooterCheckbox(input, text) {
    const labelText = document.createElement("span");
    labelText.textContent = text;

    const label = document.createElement("label");
    label.className = "band-stickers-option";
    label.append(input, labelText);

    return label;
  }

  function createRoot() {
    const root = document.createElement("div");
    root.id = ROOT_ID;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.title = "Стикеры";
    button.setAttribute("aria-label", "Открыть стикеры");
    button.setAttribute("aria-controls", PANEL_ID);
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = [
      "<svg aria-hidden='true' viewBox='0 0 24 24' focusable='false'>",
      "<path d='M6.75 3.75h7.9c.6 0 1.18.24 1.6.66l3.34 3.34c.42.42.66 1 .66 1.6v7.9a3 3 0 0 1-3 3H6.75a3 3 0 0 1-3-3V6.75a3 3 0 0 1 3-3Z'/>",
      "<path d='M15 4.25v3.1c0 .91.74 1.65 1.65 1.65h3.1'/>",
      "<path d='M8.15 13.7c1.98 1.8 5.72 1.8 7.7 0'/>",
      "<path d='M8.75 10.25h.01'/>",
      "<path d='M15.25 10.25h.01'/>",
      "</svg>"
    ].join("");
    button.addEventListener("pointerdown", togglePanel);
    button.addEventListener("click", handleButtonClick);

    root.append(button);
    createPanel();

    attachGlobalListeners();

    return root;
  }

  function attachGlobalListeners() {
    if (globalListenersAttached) {
      return;
    }

    globalListenersAttached = true;

    document.addEventListener("click", (event) => {
      const currentRoot = document.getElementById(ROOT_ID);
      const currentPanel = document.getElementById(PANEL_ID);

      if (!currentRoot?.contains(event.target) && !currentPanel?.contains(event.target)) {
        closePanel();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closePanel();
      }
      if (isStickerShortcut(event)) {
        handleStickerShortcut(event);
      }
    });

    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
  }

  function stopMattermostEvent(event) {
    event.stopPropagation();
  }

  function handleButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (event.detail === 0) {
      togglePanel(event);
    }
  }

  function togglePanel(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    togglePanelState();
  }

  function isStickerShortcut(event) {
    return event.metaKey && event.altKey && !event.ctrlKey && event.key.toLowerCase() === "s";
  }

  function handleStickerShortcut(event) {
    if (event.repeat) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    mountPicker();
    const panel = document.getElementById(PANEL_ID);

    if (panel && !panel.hidden) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function setStatus(message, isError = false) {
    const status = document.querySelector(`#${PANEL_ID} .band-stickers-status`);
    if (!status) {
      return;
    }

    window.clearTimeout(statusTimer);
    status.textContent = message;
    status.classList.toggle("is-error", isError);
    statusTimer = window.setTimeout(() => {
      status.textContent = "";
      status.classList.remove("is-error");
    }, STATUS_TIMEOUT_MS);
  }

  function getStickerSourcePath(sticker) {
    return bigStickerEnabled ? sticker.path : sticker.smallPath || sticker.path;
  }

  function getStickerFileName(sticker) {
    return `${sticker.id}${bigStickerEnabled ? "-big" : ""}.png`;
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function dispatchComposerInput(input) {
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: COMPOSER_PRIME_CHARACTER
    }));
  }

  function setNativeInputValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor?.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
  }

  async function addComposerPrimeCharacter() {
    const input = activeInput || findComposerInput();
    if (!input) {
      return async function noopPrimeCleanup() {};
    }

    input.focus();

    if ("value" in input) {
      const originalValue = input.value || "";
      setNativeInputValue(input, `${originalValue}${COMPOSER_PRIME_CHARACTER}`);
      dispatchComposerInput(input);

      return async function cleanupTextInputPrime() {
        setNativeInputValue(input, originalValue);
        dispatchComposerInput(input);
      };
    }

    if (input.isContentEditable) {
      const marker = document.createTextNode(COMPOSER_PRIME_CHARACTER);
      input.append(marker);
      dispatchComposerInput(input);

      return async function cleanupContentEditablePrime() {
        marker.remove();
        dispatchComposerInput(input);
      };
    }

    return async function noopPrimeCleanup() {};
  }

  async function blobToPng(blob) {
    const imageBitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;

    const context = canvas.getContext("2d");
    if (!context) {
      imageBitmap.close();
      throw new Error("Canvas 2D context is not available");
    }

    context.drawImage(imageBitmap, 0, 0);
    imageBitmap.close();

    return new Promise((resolve, reject) => {
      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          resolve(pngBlob);
        } else {
          reject(new Error("Failed to convert sticker to PNG"));
        }
      }, "image/png");
    });
  }

  async function loadStickerFile(sticker) {
    const response = await fetch(extensionUrl(getStickerSourcePath(sticker)));
    if (!response.ok) {
      throw new Error(`Sticker asset failed to load: ${response.status}`);
    }

    const blob = await response.blob();
    const pngBlob = blob.type === "image/png" ? blob : await blobToPng(blob);

    return new File([pngBlob], getStickerFileName(sticker), {
      type: "image/png",
      lastModified: Date.now()
    });
  }

  function dispatchStickerFile(file) {
    const input = activeInput || findComposerInput();
    const target = findComposerContainer(input) || input || document.body;
    const dataTransfer = new DataTransfer();

    dataTransfer.items.add(file);

    const fileInput =
      document.querySelector("#fileUploadInput") ||
      target.querySelector?.("input[type='file']") ||
      document.querySelector("input[type='file'][accept*='image'], input[type='file']");

    if (fileInput) {
      try {
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event("input", { bubbles: true }));
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (fileInputError) {
        console.warn("[Band Stickers] File input upload path failed", fileInputError);
      }
    }

    for (const eventName of ["dragenter", "dragover", "drop"]) {
      target.dispatchEvent(
        new DragEvent(eventName, {
          bubbles: true,
          cancelable: true,
          dataTransfer
        })
      );
    }

    target.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
      })
    );
  }

  function findSendButton() {
    const input = activeInput || findComposerInput();
    const container = findComposerContainer(input);
    const selectors = [
      "#post_create",
      "[data-testid='SendMessageButton']",
      "[data-testid='sendButton']",
      "button[aria-label*='send' i]",
      "button[aria-label*='отправ' i]",
      "button[type='submit']"
    ];

    for (const selector of selectors) {
      const button = container?.querySelector(selector) || document.querySelector(selector);
      if (button) {
        return button;
      }
    }

    return null;
  }

  function canClickSendButton(button) {
    if (!button) {
      return false;
    }

    return (
      !button.disabled &&
      button.getAttribute("aria-disabled") !== "true" &&
      button.getAttribute("disabled") === null
    );
  }

  async function sendCurrentMattermostMessage() {
    const startedAt = Date.now();

    while (Date.now() - startedAt < SEND_TIMEOUT_MS) {
      const button = findSendButton();
      if (canClickSendButton(button)) {
        button.click();
        return true;
      }

      await delay(120);
    }

    return false;
  }

  async function writeStickerToClipboard(file) {
    if (!navigator.clipboard || !window.ClipboardItem) {
      return false;
    }

    await navigator.clipboard.write([
      new ClipboardItem({
        [file.type]: file
      })
    ]);

    const input = activeInput || findComposerInput();
    if (input) {
      input.focus();
    }

    return true;
  }

  async function sendSticker(sticker) {
    try {
      const file = await loadStickerFile(sticker);
      const cleanupPrime = await addComposerPrimeCharacter();
      dispatchStickerFile(file);
      await delay(80);
      await cleanupPrime();
      trackStickerUsage(sticker);
      closePanel();

      if (instantSendEnabled) {
        setStatus("Отправляем стикер...");
        const sent = await sendCurrentMattermostMessage();
        setStatus(sent ? "Стикер отправлен" : "Стикер добавлен. Отправьте вручную.", !sent);
      } else {
        setStatus("Стикер добавлен");
      }
      if (activePackId === POPULAR_PACK_ID) {
        const panel = document.getElementById(PANEL_ID);
        if (panel) {
          renderPack(panel, POPULAR_PACK_ID);
        }
      }
    } catch (dropError) {
      console.error("[Band Stickers] Drop upload failed", dropError);

      try {
        const file = await loadStickerFile(sticker);
        const copied = await writeStickerToClipboard(file);
        setStatus(
          copied
            ? "Стикер скопирован. Вставьте его в сообщение."
            : "Не удалось добавить стикер",
          !copied
        );
      } catch (clipboardError) {
        console.error("[Band Stickers] Clipboard fallback failed", clipboardError);
        setStatus("Не удалось добавить стикер", true);
      }
    }
  }

  function mountPicker() {
    const input = findComposerInput();
    const actionRow = findComposerActionRow(input);

    if (!input || !actionRow?.row) {
      return;
    }

    activeInput = input;

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = createRoot();
    }
    if (!document.getElementById(PANEL_ID)) {
      createPanel();
    }

    if (actionRow.before?.parentElement === actionRow.row && root.nextElementSibling !== actionRow.before) {
      actionRow.row.insertBefore(root, actionRow.before);
      return;
    }

    if (
      actionRow.after?.parentElement === actionRow.row &&
      root.previousElementSibling !== actionRow.after &&
      !actionRow.before
    ) {
      actionRow.after.insertAdjacentElement("afterend", root);
      return;
    }

    if (!actionRow.row.contains(root)) {
      actionRow.row.append(root);
    }
  }

  function rememberActiveInput(event) {
    const input = event.target.closest
      ? event.target.closest("#post_textbox, [data-testid='post_textbox'], textarea, div[contenteditable='true'][role='textbox']")
      : null;

    if (input) {
      activeInput = input;
    }
  }

  if (packs.length === 0) {
    console.warn("[Band Stickers] No sticker packs registered");
    return;
  }

  document.addEventListener("focusin", rememberActiveInput);
  mountPicker();

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(mountPicker);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
