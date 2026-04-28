// src/preloader.js

export function createPreloader() {
  const root = document.getElementById("preloader");
  const fill = document.getElementById("preloaderFill");
  const text = document.getElementById("preloaderText");

  if (!root || !fill || !text) {
    console.warn("Preloader elements not found in DOM");
    return {
      setProgress: () => {},
      hide: () => {}
    };
  }

  function setProgress(value) {
    const percent = Math.max(0, Math.min(100, Math.round(value)));
    fill.style.width = percent + "%";
    text.textContent = percent + "%";
  }

  function hide() {
    root.classList.add("hidden");

    // ensure it fully disappears after transition
    setTimeout(() => {
      root.style.display = "none";
    }, 400);
  }

  // optional: instant show at start
  function show() {
    root.style.display = "flex";
    root.classList.remove("hidden");
  }

  return {
    setProgress,
    hide,
    show
  };
}
