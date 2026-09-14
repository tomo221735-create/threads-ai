export const metadata = {
  title: "プライバシーポリシー | Threads AI",
};

export default function PrivacyPage() {
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
          プライバシーポリシー
        </h1>

        <p className="mt-3 text-sm text-text-faint">
          最終更新日：[2026年09月14日]
        </p>

        <div className="mt-8 space-y-8 text-text-muted">
          <section>
            <p className="leading-relaxed">
              [大道智之]（以下「当方」といいます）は、当方が提供する「Threads
              AI」（以下「本サービス」といいます）における、利用者（以下「ユーザー」といいます）の情報の取り扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」といいます）を定めます。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              1. 収集する情報
            </h2>
            <p className="leading-relaxed">
              本サービスは、ユーザーが本サービスを利用するにあたり、以下の情報を取得します。
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
              <li>
                <span className="font-semibold text-text-primary">
                  アカウント情報：
                </span>
                メールアドレス、パスワード（暗号化して保存されます）
              </li>
              <li>
                <span className="font-semibold text-text-primary">
                  Threadsアカウント情報：
                </span>
                Threadsとの連携時にMeta社から提供される、アクセストークン、ユーザーID、ユーザー名、投稿内容、投稿日時、いいね・返信・リポスト等のインサイト（分析）データ
              </li>
              <li>
                <span className="font-semibold text-text-primary">
                  プロフィール情報：
                </span>
                発信テーマ、職業、商品・サービス内容、投稿したくないテーマ、文章の雰囲気など、ユーザーが本サービスに入力した情報
              </li>
              <li>
                <span className="font-semibold text-text-primary">
                  決済情報：
                </span>
                有料プランの契約状況、プラン名、契約日。クレジットカード番号等の決済情報自体は、決済代行会社（Stripe, Inc.）が管理し、当方のサーバーには保存されません。
              </li>
              <li>
                <span className="font-semibold text-text-primary">
                  アクセス情報：
                </span>
                Cookie、IPアドレス、ブラウザの種類、アクセス日時等
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              2. 利用目的
            </h2>
            <p className="leading-relaxed">
              取得した情報は、以下の目的のために利用します。
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
              <li>本サービスの提供・維持・改善のため</li>
              <li>
                Threadsアカウントと連携し、投稿の分析、投稿ネタの生成、自動投稿等の機能を提供するため
              </li>
              <li>AI（外部の生成AIサービスを含みます）を用いた分析・コンテンツ生成のため</li>
              <li>料金プランの契約・課金・請求管理のため</li>
              <li>
                ユーザーからのお問い合わせへの対応、重要なお知らせの連絡のため
              </li>
              <li>不正利用の防止、利用規約違反への対応のため</li>
              <li>本サービスの利用状況の分析、新機能の検討のため</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              3. 第三者提供・外部サービスの利用
            </h2>
            <p className="leading-relaxed">
              当方は、法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者に提供することはありません。ただし、本サービスの提供にあたり、以下の外部サービスに業務を委託し、必要な範囲で情報を取り扱わせることがあります。
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
              <li>
                <span className="font-semibold text-text-primary">
                  Meta Platforms, Inc.（Threads API）：
                </span>
                Threadsアカウントとの連携、投稿の取得・公開、インサイトの取得のため
              </li>
              <li>
                <span className="font-semibold text-text-primary">
                  Supabase, Inc.：
                </span>
                データベース・認証基盤として、ユーザー情報の保存のため
              </li>
              <li>
                <span className="font-semibold text-text-primary">
                  OpenAI, L.L.C.：
                </span>
                投稿ネタ・分析コメント等のAIによる生成のため
              </li>
              <li>
                <span className="font-semibold text-text-primary">
                  Stripe, Inc.：
                </span>
                有料プランの決済処理のため
              </li>
              <li>
                <span className="font-semibold text-text-primary">
                  Vercel Inc.：
                </span>
                本サービスのホスティングのため
              </li>
            </ul>
            <p className="mt-3 leading-relaxed">
              これらの外部サービスは、それぞれ独自のプライバシーポリシーに基づき情報を取り扱います。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              4. Cookie等の利用
            </h2>
            <p className="leading-relaxed">
              本サービスは、ログイン状態の維持や利用状況の把握のためにCookie等の技術を利用することがあります。ブラウザの設定によりCookieを無効にすることも可能ですが、その場合、本サービスの一部機能が正常に利用できないことがあります。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              5. データの保存期間・削除
            </h2>
            <p className="leading-relaxed">
              ユーザーの情報は、本サービスの提供に必要な期間、または法令で定められた期間保存します。ユーザーがアカウントを削除した場合、または本サービスとの連携を解除した場合、当方は合理的な期間内に、Threadsのアクセストークンを含む関連情報を削除または無効化します。ユーザーはお問い合わせ窓口（本ポリシー末尾）を通じて、自身の情報の開示・訂正・削除を請求することができます。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              6. 未成年者の利用について
            </h2>
            <p className="leading-relaxed">
              本サービスは、Threadsの利用規約に準じ、Threadsアカウントを保有できる年齢に達したユーザーを対象としています。未成年のユーザーが本サービスを利用する場合は、親権者等の同意を得た上でご利用ください。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              7. セキュリティ
            </h2>
            <p className="leading-relaxed">
              当方は、ユーザーの情報を適切に管理し、不正アクセス、紛失、漏えい、改ざん等を防止するため、合理的な安全管理措置を講じます。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              8. 本ポリシーの変更
            </h2>
            <p className="leading-relaxed">
              当方は、必要に応じて本ポリシーの内容を変更することがあります。重要な変更を行う場合は、本サービス上での掲示、または登録メールアドレスへの通知等、適切な方法で周知します。変更後のポリシーは、本ページに掲載された時点から効力を生じるものとします。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              9. お問い合わせ窓口
            </h2>
            <p className="leading-relaxed">
              本ポリシーに関するお問い合わせ、および個人情報の開示・訂正・削除等のご請求は、以下の窓口までご連絡ください。
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