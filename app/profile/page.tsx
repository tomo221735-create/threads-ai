"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
const router = useRouter();
    const [form, setForm] = useState({
    name: "",
    age: "",
    job: "",
    title: "",
    location: "",
    bio: "",
    experience: "",
    skills: "",
    goals: "",
    topics: "",
    products: "",
    forbidden_topics: "",
    tone: "親しみやすい",
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const saveProfile = async () => {
    setSaving(true);
    setMessage("");

const {
  data: { session },
} = await supabase.auth.getSession();

const user = session?.user;

if (!user) {
  setMessage("ログインしてください。");
  setSaving(false);
  return;
}

const { error } = await supabase.from("profiles").upsert({
  id: user.id,
  ...form,
  age: form.age ? Number(form.age) : null,
});

if (error) {
  console.error(error);
  setMessage("保存に失敗しました。");
} else {
  router.push("/");
}

    setSaving(false);
  };

  return (
    <main className="min-h-screen p-4 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.push("/")}
          className="mb-6 text-sm text-text-muted transition hover:text-accent-cyan"
        >
          ← 戻る
        </button>

        <h1 className="text-3xl font-bold text-text-primary">
          プロフィール設定
        </h1>

        <p className="mb-8 mt-2 text-text-muted">
          あなたについて詳しく設定すると、
          AIがよりあなたらしい投稿を作れるようになります。
        </p>

        <div className="space-y-6 rounded-2xl border border-border-soft bg-surface p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">

          <Field
            label="名前"
            value={form.name}
            onChange={(v) => updateField("name", v)}
            placeholder="例：山田太郎"
          />

          <Field
            label="年齢"
            value={form.age}
            onChange={(v) => updateField("age", v)}
            placeholder="例：32"
          />

          <Field
            label="職業"
            value={form.job}
            onChange={(v) => updateField("job", v)}
            placeholder="例：美容師"
          />

          <Field
            label="肩書き"
            value={form.title}
            onChange={(v) => updateField("title", v)}
            placeholder="例：美容室オーナー"
          />

          <Field
            label="活動地域"
            value={form.location}
            onChange={(v) => updateField("location", v)}
            placeholder="例：徳島市"
          />

          <TextArea
            label="仕事内容"
            value={form.bio}
            onChange={(v) => updateField("bio", v)}
            placeholder="現在どんな仕事をしているか"
          />

          <TextArea
            label="これまでの経験"
            value={form.experience}
            onChange={(v) => updateField("experience", v)}
            placeholder="これまで経験してきたこと"
          />

          <TextArea
            label="得意なこと"
            value={form.skills}
            onChange={(v) => updateField("skills", v)}
            placeholder="例：美容、店舗経営、採用"
          />

          <TextArea
            label="これから達成したいこと"
            value={form.goals}
            onChange={(v) => updateField("goals", v)}
            placeholder="今後の目標"
          />

          <TextArea
            label="発信したいテーマ"
            value={form.topics}
            onChange={(v) => updateField("topics", v)}
            placeholder="例：美容、経営、独立"
          />

          <TextArea
            label="商品・サービス"
            value={form.products}
            onChange={(v) => updateField("products", v)}
            placeholder="販売している商品やサービス"
          />

          <TextArea
            label="投稿したくないテーマ"
            value={form.forbidden_topics}
            onChange={(v) =>
              updateField("forbidden_topics", v)
            }
            placeholder="例：家族、政治"
          />

          <div>
            <label className="mb-2 block font-semibold text-text-primary">
              文章の雰囲気
            </label>

            <select
              value={form.tone}
              onChange={(e) =>
                updateField("tone", e.target.value)
              }
              className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
            >
              <option>親しみやすい</option>
              <option>専門的</option>
              <option>熱量高め</option>
              <option>淡々</option>
              <option>ユーモア</option>
            </select>
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="w-full rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-6 py-3.5 font-bold text-[#06110d] shadow-[0_0_20px_rgba(79,243,208,0.25)] transition active:scale-[0.98] disabled:opacity-50 sm:w-auto"
          >
            {saving ? "保存中..." : "プロフィールを保存"}
          </button>

          <button
  onClick={async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user;

    if (!user) {
      setMessage("ログインしてください。");
      return;
    }

    window.location.href =
      `/api/threads/login?userId=${encodeURIComponent(user.id)}`;
  }}
  className="w-full rounded-xl border border-border-soft bg-surface-raised px-6 py-3.5 font-semibold text-text-primary transition hover:border-accent-violet/40 active:scale-[0.98] sm:w-auto"
>
  Threadsアカウントを連携する
</button>

          {message && (
            <p className="text-accent-cyan">
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-2 block font-semibold text-text-primary">
        {label}
      </label>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary placeholder:text-text-faint outline-none transition focus:border-accent-cyan/50"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-2 block font-semibold text-text-primary">
        {label}
      </label>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary placeholder:text-text-faint outline-none transition focus:border-accent-cyan/50"
      />
    </div>
  );
}