export function childProcessEnvironment(
  command,
  {
    env = process.env,
    execPath = process.execPath,
    electronVersion = process.versions.electron,
  } = {},
) {
  if (!electronVersion || command !== execPath) return env;
  return {
    ...env,
    ELECTRON_RUN_AS_NODE: "1",
  };
}
