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
    const timedOut = res.status === 504 || res.status === 502 || /timed? ?out|FUNCTION_INVOCATION/i.test(text);
    throw new Error(timedOut
      ? `The server took too long to respond (HTTP ${res.status}). Please try again.`
      : `The server returned an unexpected response (HTTP ${res.status}). Please try again.`);
  }
}
