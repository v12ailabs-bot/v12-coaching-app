// Reads a fetch Response as JSON without throwing the browser's opaque parse
// error. When a Vercel function is killed (60s Hobby cap) or crashes, the
// body is plain text/HTML, and `res.json()` throws "The string did not match
// the expected pattern" (Safari) / "Unexpected token" (Chrome) — which tells
// the coach nothing. Returns the parsed body, or throws a readable Error that
// includes the HTTP status.
export async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    // Only a 504 / explicit timeout marker is a timeout. FUNCTION_INVOCATION_FAILED
    // is a crash, and must not be reported as "took too long".
    const timedOut = res.status === 504 || /FUNCTION_INVOCATION_TIMEOUT/i.test(text);
    const crashed = /FUNCTION_INVOCATION_FAILED/i.test(text) || res.status === 500;
    throw new Error(timedOut
      ? `The server took too long to respond (HTTP ${res.status}). Please try again.`
      : crashed
        ? `The server hit an error and could not finish (HTTP ${res.status}). Please try again, and tell support if it keeps happening.`
        : `The server returned an unexpected response (HTTP ${res.status}). Please try again.`);
  }
}
