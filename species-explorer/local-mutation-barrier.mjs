/** Serial close barrier around complete HTTP mutations, including body reads. */
export function createLocalMutationBarrier({ timeoutMs = 5000 } = {}) {
  let closing = false, active = 0;
  const listeners = new Set();
  const blocked = () => Object.assign(new Error("Der Explorer schließt gerade seine Arbeiten ab. Bitte den Abschluss abwarten."), { statusCode: 409 });
  return {
    get active() { return active; },
    get closing() { return closing; },
    enter() {
      if (closing) throw blocked();
      active++;
      let released = false;
      return () => { if (released) return; released = true; active--; if (!active) for (const listener of listeners) listener(); };
    },
    async acquire() {
      if (closing) throw blocked();
      closing = true;
      let release;
      try {
        if (active) await new Promise((resolve, reject) => {
          const complete = () => { clearTimeout(timer); listeners.delete(complete); resolve(); };
          const timer = setTimeout(() => { listeners.delete(complete); reject(blocked()); }, timeoutMs);
          listeners.add(complete);
        });
        let released = false;
        release = () => { if (!released) { released = true; closing = false; } };
        return release;
      } catch (error) { closing = false; throw error; }
    },
  };
}
