"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { User, Lock, Loader2, Sparkles } from "lucide-react";

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error("Invitation token is missing. Please use the link in your email.");
      return;
    }
    if (!name || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

    try {
      const res = await fetch(`${apiBase}/auth/accept-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Account set up successfully! Please sign in.");
        router.push("/login");
      } else {
        toast.error(data.error || "Failed to accept invitation");
      }
    } catch (err) {
      console.error("Invite acceptance failed:", err);
      toast.error("Network error, please try again");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="bg-card border border-destructive/20 rounded-xl p-6 text-center text-sm shadow-xl shadow-black/[0.03]">
        <p className="text-destructive font-bold mb-2">Invalid Invitation Link</p>
        <p className="text-muted-foreground">This link is missing a secure token. Please verify the URL or ask your administrator to send a new invite.</p>
      </div>
    );
  }

  return (
    <section className="bg-card border border-border/80 rounded-xl p-6 shadow-xl shadow-black/[0.03]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Full Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-xs font-bold text-foreground">
            Your Full Name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="name"
              type="text"
              placeholder="Sarah Jenkins"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-secondary/35 border border-border/75 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition"
              required
            />
          </div>
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-bold text-foreground">
            Create Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-secondary/35 border border-border/75 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition"
              required
            />
          </div>
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
              <span>Setting up account...</span>
            </>
          ) : (
            <span>Complete Registration</span>
          )}
        </button>
      </form>
    </section>
  );
}

export default function AcceptInvitePage() {
  return (
    <main className="min-h-screen bg-background flex flex-col justify-center items-center px-4 relative overflow-hidden select-none">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-gradient-to-br from-indigo-500/10 to-purple-500/0 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-gradient-to-tr from-emerald-500/10 to-teal-500/0 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[420px] flex flex-col gap-6 relative z-10">
        <header className="flex flex-col items-center gap-2 text-center">
          <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-black/10">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-2 text-foreground font-sans">
            Join your recruiting team
          </h1>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
            Configure your password to get started
          </p>
        </header>

        <Suspense fallback={
          <div className="flex justify-center p-8 bg-card border border-border/80 rounded-xl">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }>
          <AcceptInviteForm />
        </Suspense>
      </div>
    </main>
  );
}
