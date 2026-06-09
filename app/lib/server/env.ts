export function env(name: string, fallback = "") {
  const fromProcess =
    typeof process !== "undefined" ? process.env[name] : undefined;
  const fromBun =
    typeof Bun !== "undefined" ? Bun.env[name] : undefined;

  return fromProcess ?? fromBun ?? fallback;
}
