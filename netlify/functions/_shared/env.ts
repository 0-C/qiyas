/**
 * Netlify injects variables through Netlify.env. Local scripts and the dev
 * server fall back to process.env (populated from .env by scripts/load-env.ts).
 */
export function getEnv(key: string): string | undefined {
  const runtime = globalThis as {
    Netlify?: { env?: { get: (name: string) => string | undefined } };
  };
  try {
    const fromNetlify = runtime.Netlify?.env?.get(key);
    if (fromNetlify) return fromNetlify;
  } catch {
    // Netlify.env exists only inside the functions runtime.
  }
  const fromProcess = process.env[key];
  return fromProcess === "" ? undefined : fromProcess;
}
