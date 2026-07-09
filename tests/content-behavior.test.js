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
expectSource("scheduleMountPickers", "MutationObserver work must be coalesced through scheduleMountPickers");
expectSource("shouldScheduleMountPickers", "MutationObserver must filter unrelated Mattermost DOM mutations");
expectSource("panel?.remove()", "Closed sticker panel must be removed from DOM to unload sticker images");

if (!/function extensionUrl\(path\)\s*{[\s\S]*try\s*{[\s\S]*chrome\.runtime\.getURL\(path\)[\s\S]*catch/.test(content)) {
  errors.push("extensionUrl must guard chrome.runtime.getURL with try/catch");
}

if (!/function scheduleMountPickers\(\)\s*{[\s\S]*mountPickersFrame[\s\S]*requestAnimationFrame/.test(content)) {
  errors.push("scheduleMountPickers must deduplicate requestAnimationFrame mount passes");
}

if (!/new MutationObserver\(\(mutations\) => {[\s\S]*shouldScheduleMountPickers\(mutations\)[\s\S]*scheduleMountPickers\(\)/.test(content)) {
  errors.push("MutationObserver must schedule picker mounting only for relevant mutations");
}

if (!/function closePanel\(\)\s*{[\s\S]*panel\?\.remove\(\)[\s\S]*aria-expanded/.test(content)) {
  errors.push("closePanel must remove the panel before resetting button expanded state");
}

const createRootMatch = content.match(/function createRoot\(input\)\s*{[\s\S]*?\n  }/);
if (!createRootMatch || createRootMatch[0].includes("createPanel()")) {
  errors.push("createRoot must not create the sticker panel while it is closed");
}

const mountPickerMatch = content.match(/function mountPicker\(input\)\s*{[\s\S]*?\n  }/);
if (!mountPickerMatch || mountPickerMatch[0].includes("createPanel()")) {
  errors.push("mountPicker must not create the sticker panel while it is closed");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Content behavior checks OK");
