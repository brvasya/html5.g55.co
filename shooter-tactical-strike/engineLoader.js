// Resolve once per page so every engine module comes from the same folder.
let engineBasePromise;

async function findEngineBase() {
  const errors = [];
  for (const path of ["./engine/", "../engine/"]) {
    const base = new URL(path, import.meta.url);
    try {
      // This dependency-free module also works during the early menu setup,
      // before the page's Three.js import map has been processed.
      const module = await import(new URL("mapManager.js", base).href);
      if (typeof module.resolveMapConfig !== "function") {
        throw new Error(`Invalid game engine at ${base.href}`);
      }
      return base;
    } catch (error) {
      errors.push(error);
    }
  }
  throw new AggregateError(errors, "Game engine not found in ./engine/ or ../engine/.");
}

export async function importEngine(moduleName) {
  const base = await (engineBasePromise ||= findEngineBase());
  return import(new URL(moduleName, base).href);
}
