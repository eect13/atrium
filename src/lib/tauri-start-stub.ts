/** Client-side stand-in for TanStack Start server fns inside the Tauri bundle. */
type Ctx<T> = { data: T };

function makeFn<T = unknown>() {
  let handler: ((ctx: Ctx<T>) => unknown) | undefined;
  const call = async (args?: { data: T } | T) => {
    const data =
      args !== undefined && typeof args === "object" && args !== null && "data" in args
        ? (args as { data: T }).data
        : (args as T);
    if (!handler) throw new Error("Atrium desktop: server function has no handler");
    return handler({ data });
  };
  call.validator = () => call;
  call.inputValidator = () => call;
  call.handler = (h: (ctx: Ctx<T>) => unknown) => {
    handler = h;
    return call;
  };
  return call;
}

export function createServerFn(_opts?: unknown) {
  return makeFn();
}

export function createMiddleware() {
  return { server: () => ({}) };
}

export function getRequest() {
  return new Request("https://atrium.desktop/");
}

export function getCookie() {
  return undefined;
}

export async function setCookie() {}
