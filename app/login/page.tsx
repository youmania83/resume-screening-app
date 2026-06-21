"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Mail, Loader2, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("expired") === "true") {
      const t = setTimeout(() => {
        toast.error("Session expired, please log in again.");
      }, 150);
      return () => clearTimeout(t);
    }
  }, []);

  const handleGoogleLogin = async (token: string) => {
    setIsLoading(true);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

    try {
      const res = await fetch(`${apiBase}/auth/google-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`Welcome back, ${data.user.name}!`);
        localStorage.setItem("ira_user", JSON.stringify(data.user));
        router.push("/");
      } else {
        toast.error(data.error || "Google Sign-In failed");
      }
    } catch (err) {
      console.error("Google login failed:", err);
      toast.error("Network error, please try again");
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    const initializeGoogleSignIn = () => {
      if (typeof window !== "undefined" && (window as any).google?.accounts?.id) {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (clientId) {
          (window as any).google.accounts.id.initialize({
            client_id: clientId,
            callback: async (response: any) => {
              await handleGoogleLogin(response.credential);
            },
          });
          (window as any).google.accounts.id.renderButton(
            document.getElementById("google-signin-button"),
            { theme: "outline", size: "large", width: 370 }
          );
        }
      }
    };

    if (typeof window !== "undefined") {
      if ((window as any).google?.accounts?.id) {
        initializeGoogleSignIn();
      } else {
        const interval = setInterval(() => {
          if ((window as any).google?.accounts?.id) {
            initializeGoogleSignIn();
            clearInterval(interval);
          }
        }, 100);
        return () => clearInterval(interval);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`Welcome back, ${data.user.name}!`);
        // Store user state in localStorage (but token is in HttpOnly cookie)
        localStorage.setItem("ira_user", JSON.stringify(data.user));
        // Redirect to dashboard
        router.push("/");
      } else {
        toast.error(data.error || "Invalid email or password");
      }
    } catch (err) {
      console.error("Login failed:", err);
      toast.error("Network error, please try again");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex flex-col justify-center items-center px-4 relative overflow-hidden select-none">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-gradient-to-br from-indigo-500/10 to-purple-500/0 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-gradient-to-tr from-emerald-500/10 to-teal-500/0 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[420px] flex flex-col gap-6 relative z-10">
        <header className="flex flex-col items-center gap-2 text-center">
          <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-black/10">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-2 text-foreground font-sans">
            Sign in to IRA AI
          </h1>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
            Enterprise Recruiting Platform
          </p>
        </header>

        <section className="bg-card border border-border/80 rounded-xl p-6 shadow-xl shadow-black/[0.03]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Email input */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-bold text-foreground">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-secondary/35 border border-border/75 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition"
                  required
                />
              </div>
            </div>

            {/* Password input */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-bold text-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2 text-sm bg-secondary/35 border border-border/75 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me and Forgot Password */}
            <div className="flex items-center justify-between text-xs mt-1">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-muted-foreground select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <span>Remember me for 30 days</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 bg-primary text-primary-foreground font-bold text-sm rounded-lg hover:opacity-90 active:scale-[0.99] transition flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>

            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-card px-2 text-muted-foreground font-semibold">Or continue with</span>
              </div>
            </div>

            <div className="flex justify-center w-full min-h-[40px]">
              <div id="google-signin-button" />
            </div>

            {process.env.NODE_ENV !== "production" && (
              <button
                type="button"
                onClick={() => handleGoogleLogin("mock-google-token")}
                className="w-full py-2 border border-dashed border-primary/40 text-primary hover:bg-primary/5 font-bold text-xs rounded-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="h-3 w-3" />
                <span>Dev Mock Google Login</span>
              </button>
            )}
          </form>
        </section>

        <footer className="text-center text-xs text-muted-foreground font-semibold">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            onClick={() => router.push("/register")}
            className="text-foreground font-bold hover:underline"
          >
            Register your company
          </button>
        </footer>
      </div>
    </main>
  );
}
