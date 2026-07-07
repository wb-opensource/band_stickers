const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const content = fs.readFileSync(path.join(projectRoot, "src", "content.js"), "utf8");
const errors = [];

function expectSource(fragment, message) {
  if (!content.includes(fragment)) {
    errors.push(message);
  }
}

expectSource("#reply_textbox", "Thread reply composer selector #reply_textbox is missing");
expectSource("[data-testid='reply_textbox']", "Thread reply composer data-testid selector is missing");
expectSource("textarea[aria-label*='обсуж' i]", "Discussion aria-label selector is missing");
expectSource("handleInvalidExtensionContext", "Extension context invalidation handler is missing");
expectSource("chrome.runtime.getURL", "Extension asset URLs must still use chrome.runtime.getURL");
expectSource("observer?.disconnect()", "Invalidated context must disconnect MutationObserver");

if (!/function extensionUrl\(path\)\s*{[\s\S]*try\s*{[\s\S]*chrome\.runtime\.getURL\(path\)[\s\S]*catch/.test(content)) {
  errors.push("extensionUrl must guard chrome.runtime.getURL with try/catch");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Content behavior checks OK");
