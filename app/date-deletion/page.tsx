export const metadata = {
  title: "データの削除について | Threads AI",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <a
          href="/"
          className="mb-6 inline-block text-sm text-text-muted transition hover:text-accent-cyan"
        >
          ← トップへ戻る
        </a>

        <h1 className="text-3xl font-bold text-text-primary">
          データの削除について
        </h1>

        <p className="mt-3 text-sm text-text-faint">
          最終更新日：[YYYY年MM月DD日]
        </p>

        <div className="mt-8 space-y-8 text-text-muted">
          <section>
            <p className="leading-relaxed">
              「Threads AI」（以下「本サービス」といいます）を利用する中で当方が保有しているユーザーの情報について、削除をご希望の場合は、以下の手順に沿ってご請求ください。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              当方が保有している情報
            </h2>
            <p className="leading-relaxed">
              本サービスは、ユーザーがThreadsアカウントと連携した際に、以下の情報を保存しています。詳しくは
              <a
                href="/privacy"
                className="mx-1 underline hover:text-accent-cyan"
              >
                プライバシーポリシー
              </a>
              をご覧ください。
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
              <li>アカウント情報（メールアドレス等）</li>
              <li>
                Threads連携情報（アクセストークン、ユーザーID、ユーザー名）
              </li>
              <li>Threadsから取得した投稿データ・インサイト（分析）データ</li>
              <li>プロフィールに入力された情報（発信テーマ、職業等）</li>
              <li>AIが生成した投稿ネタ・文章の履歴</li>
              <li>契約プラン等の課金関連情報</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              削除の請求方法
            </h2>
            <p className="leading-relaxed">
              以下のいずれかの方法で、データの削除をご請求いただけます。
            </p>

            <div className="mt-4 rounded-xl border border-border-soft bg-surface p-5">
              <h3 className="font-semibold text-text-primary">
                方法1：メールでのご請求
              </h3>
              <p className="mt-2 leading-relaxed">
                下記の連絡先メールアドレスまで、次の内容を記載の上ご連絡ください。
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
                <li>件名：「データ削除のご請求」</li>
                <li>本サービスにご登録のメールアドレス</li>
                <li>
                  （Threadsアカウントを連携している場合）ThreadsのユーザーID、またはユーザーネーム
                </li>
              </ul>
              <p className="mt-3 leading-relaxed">
                連絡先：[連絡先メールアドレス]
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-border-soft bg-surface p-5">
              <h3 className="font-semibold text-text-primary">
                方法2：Threads/Meta側からの連携解除
              </h3>
              <p className="mt-2 leading-relaxed">
                Threadsアプリまたはinstagram.com/accounts/manage_access/から、本サービス（Threads
                AI）との連携を解除することもできます。連携が解除されると、当方が保有するアクセストークンは無効になります。連携の解除だけでは、当方サーバー上に保存された投稿データ等は自動削除されないため、完全な削除をご希望の場合は方法1のメールでのご請求もあわせて行ってください。
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              削除の流れ・期間
            </h2>
            <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
              <li>
                上記の方法でご請求をいただくと、当方より受付確認のご連絡をいたします。
              </li>
              <li>
                本人確認（ご登録のメールアドレスからのご連絡であることの確認）の後、合理的な期間内（通常30日以内）に、対象データをデータベースから削除します。
              </li>
              <li>
                削除が完了しましたら、その旨をご請求いただいたメールアドレス宛にご連絡いたします。
              </li>
            </ol>
            <p className="mt-3 leading-relaxed">
              なお、法令により保存が義務付けられている情報（決済記録等）については、当該法令で定められた期間、削除せず保持する場合があります。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              お問い合わせ
            </h2>
            <p className="leading-relaxed">
              データの削除に関するご不明点は、以下までお問い合わせください。
            </p>
            <p className="mt-3 leading-relaxed">
              運営者：[大道智之]
              <br />
              連絡先：[tomo.221735@icloud.com]
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}