(() => {
  const PANEL_ID = "translate-token-protector-panel";
  const STATUS_ID = "translate-token-protector-status";
  const TOGGLE_ID = "translate-token-protector-toggle";

  const keepMap = new Map();
  let keepCounter = 0;
  let isEnabled = true;

  const listPattern =
    /\b[A-Za-z][A-Za-z0-9_-]*(?:\s*,\s*[A-Za-z][A-Za-z0-9_-]*)+\s*,?\s+(?:and|or)\s+[A-Za-z][A-Za-z0-9_-]*\b/g;

  const tokenPattern = /\bZXQKEEP\d{4,}ZXQ\b/g;

  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "TEXTAREA",
    "INPUT",
    "NOSCRIPT",
    "SELECT",
    "OPTION"
  ]);

  function makeToken(payload) {
    keepCounter += 1;
    const token = `ZXQKEEP${String(keepCounter).padStart(4, "0")}ZXQ`;
    keepMap.set(token, payload);
    return token;
  }

  function isInsidePanel(node) {
    return Boolean(node.parentElement?.closest(`#${PANEL_ID}`));
  }

  function shouldSkipElement(element) {
    if (!element) return true;

    if (SKIP_TAGS.has(element.tagName)) return true;

    if (
      element.closest(
        [
          `#${PANEL_ID}`,
          "[contenteditable='true']",
          "[aria-hidden='true']",
          "svg",
          "canvas",
          "math",
          "button",
          "textarea",
          "input",
          "select"
        ].join(",")
      )
    ) {
      return true;
    }

    return false;
  }

  function shouldSkipTextNode(node) {
    const parent = node.parentElement;
    if (!parent) return true;

    if (shouldSkipElement(parent)) return true;

    // code の中身は code 要素ごと処理する
    if (parent.closest("code, kbd, samp, var")) return true;

    return !node.nodeValue || !node.nodeValue.trim();
  }

  function collectCodeLikeElements(root = document.body) {
    const elements = [];

    if (!root || root.nodeType !== Node.ELEMENT_NODE) {
      return elements;
    }

    const selector = [
      "code",
      "kbd",
      "samp",
      "var",
      ".code",
      ".inline-code",
      ".fm-code-in-text",
      "[class*='code']"
    ].join(",");

    if (root.matches?.(selector)) {
      elements.push(root);
    }

    root.querySelectorAll?.(selector).forEach((element) => {
      elements.push(element);
    });

    return elements;
  }

  function protectInlineCodeLikeElements(root = document.body) {
    const elements = collectCodeLikeElements(root);

    for (const element of elements) {
      if (!element.isConnected) continue;
      if (shouldSkipElement(element)) continue;

      // 復元済み要素は再トークン化しない
      if (element.dataset.keepRestored === "true") continue;
      if (element.dataset.keepTokenized === "true") continue;

      const originalText = element.textContent || "";
      if (!originalText.trim()) continue;

      // 長すぎる code-like ブロックは避ける。pre ブロックや大きなコード片の誤爆防止。
      if (originalText.length > 120) continue;

      const token = makeToken({
        type: "element",
        tagName: element.tagName.toLowerCase(),
        text: originalText,
        className: element.className || "",
        attributes: Array.from(element.attributes)
          .filter((attr) => !attr.name.startsWith("data-"))
          .map((attr) => [attr.name, attr.value])
      });

      element.dataset.keepTokenized = "true";
      element.replaceWith(document.createTextNode(token));
    }
  }

  function replaceListsWithTokens(root = document.body) {
    if (!root) return;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return shouldSkipTextNode(node)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    let node;

    while ((node = walker.nextNode())) {
      const text = node.nodeValue || "";

      tokenPattern.lastIndex = 0;
      if (tokenPattern.test(text)) {
        tokenPattern.lastIndex = 0;
        continue;
      }

      listPattern.lastIndex = 0;
      if (listPattern.test(text)) {
        nodes.push(node);
      }
    }

    for (const textNode of nodes) {
      listPattern.lastIndex = 0;

      textNode.nodeValue = textNode.nodeValue.replace(listPattern, (match) => {
        return makeToken({
          type: "text",
          text: match
        });
      });
    }
  }

  function createRestoredElement(payload) {
    const tagName = payload.tagName || "code";

    const allowedTags = new Set(["code", "kbd", "samp", "var", "span"]);
    const element = document.createElement(
      allowedTags.has(tagName) ? tagName : "code"
    );

    for (const [name, value] of payload.attributes || []) {
      if (name.startsWith("data-")) continue;

      // onclick などは復元しない
      if (name.toLowerCase().startsWith("on")) continue;

      element.setAttribute(name, value);
    }

    if (payload.className) {
      element.className = payload.className;
    }

    element.classList.add("notranslate");
    element.setAttribute("translate", "no");
    element.dataset.keepRestored = "true";
    element.textContent = payload.text;

    return element;
  }

  function restoreTokens(root = document.body) {
    if (!root) return 0;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return isInsidePanel(node)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    let node;

    while ((node = walker.nextNode())) {
      const text = node.nodeValue || "";

      tokenPattern.lastIndex = 0;
      if (tokenPattern.test(text)) {
        nodes.push(node);
      }
    }

    let restoredCount = 0;

    for (const textNode of nodes) {
      const text = textNode.nodeValue || "";
      const fragment = document.createDocumentFragment();

      tokenPattern.lastIndex = 0;

      let lastIndex = 0;
      let match;

      while ((match = tokenPattern.exec(text)) !== null) {
        const token = match[0];
        const payload = keepMap.get(token);

        if (match.index > lastIndex) {
          fragment.appendChild(
            document.createTextNode(text.slice(lastIndex, match.index))
          );
        }

        if (!payload) {
          fragment.appendChild(document.createTextNode(token));
        } else if (payload.type === "element") {
          fragment.appendChild(createRestoredElement(payload));
          restoredCount += 1;
        } else {
          fragment.appendChild(document.createTextNode(payload.text));
          restoredCount += 1;
        }

        lastIndex = match.index + token.length;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      textNode.replaceWith(fragment);
    }

    return restoredCount;
  }

  function protectAll(root = document.body) {
    if (!root) return 0;

    const beforeCount = keepMap.size;

    protectInlineCodeLikeElements(root);
    replaceListsWithTokens(root);

    return keepMap.size - beforeCount;
  }

  function countVisibleTokens(root = document.body) {
    if (!root) return 0;

    let count = 0;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return isInsidePanel(node)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;

    while ((node = walker.nextNode())) {
      const text = node.nodeValue || "";
      tokenPattern.lastIndex = 0;

      const matches = text.match(tokenPattern);
      if (matches) count += matches.length;
    }

    return count;
  }

  function showStatus(message) {
    const status = document.querySelector(`#${STATUS_ID}`);
    if (!status) return;

    status.textContent = message;

    window.clearTimeout(showStatus._timer);
    showStatus._timer = window.setTimeout(() => {
      status.textContent = "";
    }, 5000);
  }

  function setEnabled(enabled) {
    isEnabled = enabled;

    const panel = document.querySelector(`#${PANEL_ID}`);
    const toggleButton = document.querySelector(`#${TOGGLE_ID}`);

    if (toggleButton) {
      toggleButton.textContent = isEnabled ? "ON" : "OFF";
      toggleButton.style.background = isEnabled ? "#e8fff0" : "#f3f3f3";
      toggleButton.style.color = isEnabled ? "#064d1f" : "#666";
      toggleButton.style.borderColor = isEnabled ? "#2f9e44" : "#999";
    }

    if (panel) {
      panel.style.opacity = isEnabled ? "1" : "0.65";
    }

    showStatus(isEnabled ? "有効にしました" : "無効にしました");
  }

  function assertEnabled() {
    if (!isEnabled) {
      showStatus("現在OFFです");
      return false;
    }

    return true;
  }

  function createButton(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;

    Object.assign(button.style, {
      display: "block",
      width: "100%",
      margin: "4px 0",
      padding: "6px 8px",
      border: "1px solid #555",
      borderRadius: "6px",
      background: "#fff",
      color: "#111",
      cursor: "pointer",
      fontSize: "12px",
      lineHeight: "1.2"
    });

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      try {
        onClick();
      } catch (error) {
        console.error("[Translate Token Protector]", error);
        showStatus(`エラー: ${error.message}`);
      }
    });

    return button;
  }

  function createPanel() {
    if (document.querySelector(`#${PANEL_ID}`)) {
      return;
    }

    const panel = document.createElement("div");
    panel.id = PANEL_ID;

    Object.assign(panel.style, {
      position: "fixed",
      right: "12px",
      bottom: "12px",
      zIndex: "2147483647",
      width: "205px",
      padding: "8px",
      border: "1px solid #333",
      borderRadius: "8px",
      background: "rgba(250, 250, 250, 0.96)",
      color: "#111",
      fontFamily:
        "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      fontSize: "12px",
      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)"
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      marginBottom: "6px"
    });

    const title = document.createElement("div");
    title.textContent = "Translate Protector";
    Object.assign(title.style, {
      fontWeight: "700"
    });

    const toggleButton = document.createElement("button");
    toggleButton.id = TOGGLE_ID;
    toggleButton.type = "button";
    toggleButton.textContent = "ON";

    Object.assign(toggleButton.style, {
      minWidth: "44px",
      padding: "4px 8px",
      border: "1px solid #2f9e44",
      borderRadius: "999px",
      background: "#e8fff0",
      color: "#064d1f",
      cursor: "pointer",
      fontSize: "12px",
      fontWeight: "700"
    });

    toggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setEnabled(!isEnabled);
    });

    header.appendChild(title);
    header.appendChild(toggleButton);

    const protectButton = createButton("1. 翻訳前: tokenize", () => {
      if (!assertEnabled()) return;

      const count = protectAll(document.body);
      showStatus(`${count} 件をトークン化しました`);
    });

    const restoreButton = createButton("2. 翻訳後: 復元", () => {
      if (!assertEnabled()) return;

      const count = restoreTokens(document.body);
      const remaining = countVisibleTokens(document.body);
      showStatus(`${count} 件を復元 / 残り ${remaining} 件`);
    });

    const countButton = createButton("token数を確認", () => {
      if (!assertEnabled()) return;

      const visible = countVisibleTokens(document.body);
      showStatus(`表示中: ${visible} 件 / 保存済み: ${keepMap.size} 件`);
    });

    const status = document.createElement("div");
    status.id = STATUS_ID;
    Object.assign(status.style, {
      minHeight: "16px",
      marginTop: "6px",
      color: "#333",
      fontSize: "11px",
      wordBreak: "break-word"
    });

    const note = document.createElement("div");
    note.textContent = "1 → Google翻訳 → 2";
    Object.assign(note.style, {
      marginTop: "6px",
      color: "#555",
      fontSize: "11px"
    });

    panel.appendChild(header);
    panel.appendChild(protectButton);
    panel.appendChild(restoreButton);
    panel.appendChild(countButton);
    panel.appendChild(status);
    panel.appendChild(note);

    document.documentElement.appendChild(panel);

    setEnabled(isEnabled);
  }

  function init() {
    createPanel();

    window.__protectTranslateAll = () => protectAll(document.body);
    window.__restoreTranslateAll = () => restoreTokens(document.body);
    window.__countTranslateTokens = () => countVisibleTokens(document.body);
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
})();

