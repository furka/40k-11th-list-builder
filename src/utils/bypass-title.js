const bypassModifierKey = (() => {
  if (typeof navigator === "undefined") return "Ctrl";
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘" : "Ctrl";
})();

export const bypassTitle = `Add or attach units and enhancements without restrictions.\n\nOr hold ${bypassModifierKey} while clicking or dragging.`;
