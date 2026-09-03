"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

   router.push("/profile");
router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold">
          Threads AI
        </h1>

        <p className="mb-8 mt-2 text-gray-600">
          ログイン
        </p>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border p-3"
          />

          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border p-3"
          />

          <button
            onClick={login}
            disabled={loading}
            className="w-full rounded-lg bg-black px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>

          {error && (
            <p className="text-sm text-red-500">
              {error}
            </p>
          )}

          <a
            href="/register"
            className="block text-center text-sm text-gray-600 underline"
          >
            アカウントを作成する
          </a>
        </div>
      </div>
    </main>
  );
}