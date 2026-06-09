function normalizeEnvValue(value: string | undefined) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function env(name: string, fallback = "") {
  const fromProcess =
    typeof process !== "undefined" ? process.env[name] : undefined;
  const fromBun =
    typeof Bun !== "undefined" ? Bun.env[name] : undefined;

  return normalizeEnvValue(fromProcess ?? fromBun) || fallback;
}
