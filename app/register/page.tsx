"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const register = async () => {
    setLoading(true);
    setError("");
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setMessage(
      "登録しました。メールアドレスの確認が必要な場合があります。"
    );

    setTimeout(() => {
      router.push("/login");
    }, 1500);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">

        <div className="mb-6 flex justify-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-3 py-1 text-xs font-semibold tracking-wide text-accent-cyan">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan shadow-[0_0_8px_2px_rgba(79,243,208,0.7)]" />
            AI SNS ASSISTANT
          </div>
        </div>

        <div className="rounded-2xl border border-border-soft bg-surface p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">

          <h1 className="text-center text-3xl font-bold tracking-tight text-text-primary">
            Threads AI
          </h1>

          <p className="mb-8 mt-2 text-center text-text-muted">
            アカウント作成
          </p>

          <div className="space-y-4">
            <input
              type="email"
              placeholder="メールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition placeholder:text-text-faint focus:border-accent-cyan/50"
            />

            <input
              type="password"
              placeholder="パスワード（6文字以上）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition placeholder:text-text-faint focus:border-accent-cyan/50"
            />

            <button
              onClick={register}
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-5 py-4 font-bold text-[#06110d] shadow-[0_0_20px_rgba(79,243,208,0.25)] transition active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "登録中..." : "アカウントを作成"}
            </button>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-xl border border-accent-cyan/20 bg-accent-cyan/10 p-4 text-sm text-accent-cyan">
                {message}
              </div>
            )}

            <a
              href="/login"
              className="block text-center text-sm text-text-muted transition hover:text-accent-cyan"
            >
              ログインはこちら
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}