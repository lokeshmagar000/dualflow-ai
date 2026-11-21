/**
 * Next.js runs register() once when the dashboard server starts.
 * We use it to start the API inside this server (one server mode), see lib/inside-api.ts.
 * The "if" must look exactly like this, so Next.js leaves the server-only code out of the middleware build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startInsideApi } = await import("./lib/inside-api");
    startInsideApi();
  }
}
