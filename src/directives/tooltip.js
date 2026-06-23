import "./tooltip.css";

const SHOW_DELAY = 100;
const HIDE_DELAY = 80;
const VIEWPORT_MARGIN = 8;
const TARGET_GAP = 6;

let tooltipEl = null;
let currentTarget = null;
let showTimer = null;
let hideTimer = null;
let listenersAttached = false;

const supportsPopover =
  typeof HTMLElement !== "undefined" &&
  "showPopover" in HTMLElement.prototype;

function ensureTooltipEl() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement("div");
  tooltipEl.className = "app-tooltip";
  if (supportsPopover) tooltipEl.setAttribute("popover", "manual");
  tooltipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function position(target) {
  if (!tooltipEl || !target) return;
  const rect = target.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();

  let placement = "top";
  let top = rect.top - tipRect.height - TARGET_GAP;
  if (top < VIEWPORT_MARGIN) {
    placement = "bottom";
    top = rect.bottom + TARGET_GAP;
  }
  if (top + tipRect.height > window.innerHeight - VIEWPORT_MARGIN) {
    top = window.innerHeight - tipRect.height - VIEWPORT_MARGIN;
  }

  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(left, window.innerWidth - tipRect.width - VIEWPORT_MARGIN)
  );

  tooltipEl.dataset.placement = placement;
  tooltipEl.style.top = `${Math.round(top)}px`;
  tooltipEl.style.left = `${Math.round(left)}px`;
}

function reveal(target, text) {
  ensureTooltipEl();
  tooltipEl.textContent = text;
  currentTarget = target;
  tooltipEl.style.top = "0px";
  tooltipEl.style.left = "0px";
  if (supportsPopover) {
    try {
      tooltipEl.showPopover();
    } catch {
      // already open — fine
    }
  } else {
    tooltipEl.classList.add("app-tooltip--visible");
  }
  requestAnimationFrame(() => {
    if (currentTarget === target) position(target);
  });
  attachGlobalListeners();
}

function hide(target) {
  if (target && currentTarget !== target) return;
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  showTimer = null;
  hideTimer = null;
  currentTarget = null;
  if (tooltipEl) {
    if (supportsPopover) {
      try {
        tooltipEl.hidePopover();
      } catch {
        // not open — fine
      }
    } else {
      tooltipEl.classList.remove("app-tooltip--visible");
    }
  }
  detachGlobalListeners();
}

function scheduleShow(target) {
  const text = target._tooltipText;
  if (!text) return;
  if (target._tooltipSuppressed) return;
  clearTimeout(hideTimer);
  hideTimer = null;
  if (currentTarget === target) return;
  if (currentTarget && currentTarget !== target) {
    clearTimeout(showTimer);
    showTimer = null;
    reveal(target, text);
    return;
  }
  clearTimeout(showTimer);
  showTimer = setTimeout(() => {
    showTimer = null;
    reveal(target, text);
  }, SHOW_DELAY);
}

function scheduleHide(target) {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (currentTarget !== target) return;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    hideTimer = null;
    hide(target);
  }, HIDE_DELAY);
}

function updateText(target, text) {
  if (currentTarget !== target) return;
  if (!text) {
    hide(target);
    return;
  }
  tooltipEl.textContent = text;
  requestAnimationFrame(() => {
    if (currentTarget === target) position(target);
  });
}

function onScroll() {
  if (currentTarget) hide(currentTarget);
}
function onResize() {
  if (currentTarget) hide(currentTarget);
}
function onKeyDown(e) {
  if (e.key === "Escape" && currentTarget) hide(currentTarget);
}
function onGlobalPointerDown(e) {
  if (!currentTarget) return;
  if (currentTarget.contains(e.target)) return;
  hide(currentTarget);
}

function attachGlobalListeners() {
  if (listenersAttached) return;
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("pointerdown", onGlobalPointerDown, { capture: true });
  listenersAttached = true;
}

function detachGlobalListeners() {
  if (!listenersAttached) return;
  window.removeEventListener("scroll", onScroll, { capture: true });
  window.removeEventListener("resize", onResize);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("pointerdown", onGlobalPointerDown, { capture: true });
  listenersAttached = false;
}

function hasAccessibleName(el) {
  if (el.getAttribute("aria-label")) return true;
  if (el.getAttribute("aria-labelledby")) return true;
  return (el.textContent || "").trim().length > 0;
}

function applyAriaLabel(el, text) {
  if (!text) return;
  if (hasAccessibleName(el)) return;
  el.setAttribute("aria-label", text);
  el._tooltipAddedAriaLabel = true;
}

function clearAriaLabel(el) {
  if (el._tooltipAddedAriaLabel) {
    el.removeAttribute("aria-label");
    delete el._tooltipAddedAriaLabel;
  }
}

function onEnter(e) {
  const el = e.currentTarget;
  el._tooltipHovered = true;
  scheduleShow(el);
}

function onLeave(e) {
  const el = e.currentTarget;
  el._tooltipHovered = false;
  el._tooltipSuppressed = false;
  if (!el._tooltipFocused) scheduleHide(el);
}

function onFocus(e) {
  const el = e.currentTarget;
  el._tooltipFocused = true;
  scheduleShow(el);
}

function onBlur(e) {
  const el = e.currentTarget;
  el._tooltipFocused = false;
  if (!el._tooltipHovered) scheduleHide(el);
}

// Hide on press and keep hidden until pointer leaves — prevents the tooltip
// flashing back as focus lands on the just-clicked button.
function onTargetPointerDown(e) {
  const el = e.currentTarget;
  el._tooltipSuppressed = true;
  hide(el);
}

function readText(value) {
  if (value == null) return "";
  return String(value);
}

export const tooltip = {
  mounted(el, binding) {
    const text = readText(binding.value);
    el._tooltipText = text;
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("focus", onFocus);
    el.addEventListener("blur", onBlur);
    el.addEventListener("pointerdown", onTargetPointerDown);
    applyAriaLabel(el, text);
  },
  updated(el, binding) {
    const text = readText(binding.value);
    if (text === el._tooltipText) return;
    el._tooltipText = text;
    if (el._tooltipAddedAriaLabel) {
      if (text) el.setAttribute("aria-label", text);
      else clearAriaLabel(el);
    } else {
      applyAriaLabel(el, text);
    }
    updateText(el, text);
  },
  unmounted(el) {
    el.removeEventListener("pointerenter", onEnter);
    el.removeEventListener("pointerleave", onLeave);
    el.removeEventListener("focus", onFocus);
    el.removeEventListener("blur", onBlur);
    el.removeEventListener("pointerdown", onTargetPointerDown);
    clearAriaLabel(el);
    if (currentTarget === el) hide(el);
    delete el._tooltipText;
    delete el._tooltipHovered;
    delete el._tooltipFocused;
    delete el._tooltipSuppressed;
  },
};
