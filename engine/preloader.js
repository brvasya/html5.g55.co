export function createPreloader() {
  const root = document.getElementById("preloader");
  const fill = document.getElementById("preloaderFill");
  const text = document.getElementById("preloaderText");

  function setProgress(value) {
    const percent = Math.max(0, Math.min(100, Math.round(value)));
    fill.style.width = percent + "%";
    text.textContent = percent + "%";
  }

  function hide() {
    root.classList.add("hidden");
  }

  function show() {
    root.classList.remove("hidden");
  }

  return {
    setProgress,
    hide,
    show
  };
}
