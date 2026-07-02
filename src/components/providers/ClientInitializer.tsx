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

      const targetApiUrl = process.env.NEXT_PUBLIC_API_URL || "https://resume-screening-app-databaseurl.up.railway.app/api";
      
      const isLocalApi = url.includes("localhost:4000/api") || url.startsWith("/api");
      const isProdApi = url.includes("resume-screening-app-databaseurl.up.railway.app/api") || (!!process.env.NEXT_PUBLIC_API_URL && url.includes(process.env.NEXT_PUBLIC_API_URL));

      if (isLocalApi || isProdApi) {
        const hostname = window.location.hostname;
        if (hostname !== "localhost" && hostname !== "127.0.0.1") {
          if (isLocalApi) {
            url = url.replace(/https?:\/\/localhost:4000\/api/, targetApiUrl);
            if (url.startsWith("/api")) {
              const cleanPath = url.startsWith("/api/") ? url.substring(5) : url.substring(4);
              url = `${targetApiUrl}/${cleanPath}`;
            }
          }
        }

        const newInit: RequestInit = {
          ...init,
          credentials: "include",
        };

        const handleResponse = (response: Response) => {
          if (
            response.status === 401 &&
            !url.includes("/api/auth/login") &&
            !url.includes("/api/auth/register") &&
            !url.includes("/api/auth/accept-invite")
          ) {
            localStorage.removeItem("ira_user");
            if (window.location.pathname !== "/login") {
              window.location.href = "/login?expired=true";
            }
          }
          return response;
        };

        if (typeof input === "string") {
          return originalFetch(url, newInit).then(handleResponse);
        } else if (input instanceof URL) {
          return originalFetch(new URL(url), newInit).then(handleResponse);
        } else {
          const newRequest = new Request(url, input as any);
          return originalFetch(newRequest, newInit).then(handleResponse);
        }
      }

      return originalFetch(input, init);
    };
  }
}

export function ClientInitializer() {
  return null;
}
