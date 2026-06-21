"use client";

if (typeof window !== "undefined") {
  const win = window as any;
  if (!win.__fetchPatched) {
    win.__fetchPatched = true;
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
      let url = "";
      if (typeof input === "string") {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input && typeof input === "object" && "url" in input) {
        url = (input as any).url;
      }

      const isLocalApi = url.includes("localhost:4000/api") || url.startsWith("/api");
      const isProdApi = url.includes("resume-screening-app-databaseurl.up.railway.app/api");

      if (isLocalApi || isProdApi) {
        const hostname = window.location.hostname;
        if (hostname !== "localhost" && hostname !== "127.0.0.1") {
          if (isLocalApi) {
            url = url.replace(/https?:\/\/localhost:4000\/api/, "https://resume-screening-app-databaseurl.up.railway.app/api");
            if (url.startsWith("/api")) {
              url = `https://resume-screening-app-databaseurl.up.railway.app${url}`;
            }
          }
        }

        const newInit: RequestInit = {
          ...init,
          credentials: "include",
        };

        if (typeof input === "string") {
          return originalFetch(url, newInit);
        } else if (input instanceof URL) {
          return originalFetch(new URL(url), newInit);
        } else {
          const newRequest = new Request(url, input as any);
          return originalFetch(newRequest, newInit);
        }
      }

      return originalFetch(input, init);
    };
  }
}

export function ClientInitializer() {
  return null;
}
