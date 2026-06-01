// Maps the raw error bodies emitted by packages/functions/src/agents/contract.ts
// and orders-create.ts into a user-facing shape. We intentionally do this on
// the dashboard side so we can ship clearer messages without redeploying
// Functions during the judging window.

export type OrderErrorCode =
  | 'unknown_worker'
  | 'unknown_repository'
  | 'over_spending_limit'
  | 'deadline_in_past'
  | 'missing_info'
  | 'orderId_mismatch'
  | 'issue_body_missing_marker'
  | 'auth_expired'
  | 'forbidden'
  | 'validation'
  | 'unknown';

export type OrderErrorView = {
  code: OrderErrorCode;
  title: string;
  detail: string;
  hint?: string;
  raw?: string;
};

// Extract { error: "..." } string from a Functions response body. The Functions
// handler currently returns { error: String(err) } so the message text is
// preserved verbatim.
function extractRawMessage(bodyText: string): string {
  if (!bodyText) return '';
  try {
    const j = JSON.parse(bodyText) as { error?: unknown; message?: unknown };
    if (typeof j.error === 'string') return j.error;
    if (j.error && typeof j.error === 'object') return JSON.stringify(j.error);
    if (typeof j.message === 'string') return j.message;
  } catch {
    // not JSON — return raw text
  }
  return bodyText;
}

export function classifyOrderError(
  status: number,
  bodyText: string,
): OrderErrorView {
  const raw = extractRawMessage(bodyText);
  const lower = raw.toLowerCase();

  if (status === 401) {
    return {
      code: 'auth_expired',
      title: 'ログインの有効期限が切れました',
      detail: 'もう一度サインインしてください。',
      raw,
    };
  }
  if (status === 403) {
    return {
      code: 'forbidden',
      title: '権限がありません',
      detail: 'このアカウントには発注を行う PM ロールが付与されていません。',
      raw,
    };
  }

  if (
    lower.includes('リポジトリ') ||
    lower.includes('repositories') ||
    lower.includes('repository') && lower.includes('存在しません')
  ) {
    return {
      code: 'unknown_repository',
      title: 'リポジトリが登録されていません',
      detail:
        '依頼文に書かれたリポジトリがこのテナントの許可リストにありません。',
      hint:
        '下に表示されている「使えるリポジトリ」をそのままコピーして使ってください。',
      raw,
    };
  }
  if (lower.includes('unknown_worker')) {
    return {
      code: 'unknown_worker',
      title: '受注者が登録されていません',
      detail:
        '依頼文に書かれた名前に一致する受注者が見つかりませんでした。下に表示されている「登録済みの受注者」から名前をコピーして使ってください。',
      raw,
    };
  }
  if (lower.includes('over_spending_limit')) {
    return {
      code: 'over_spending_limit',
      title: '金額が上限を超えています',
      detail:
        '1 件あたりの上限 (デフォルト 100,000 JPYC) を超える金額が指定されました。',
      hint: '金額を 100,000 JPYC 以下にして再送してください。',
      raw,
    };
  }
  if (lower.includes('deadline_in_past')) {
    return {
      code: 'deadline_in_past',
      title: '期日が過去になっています',
      detail:
        '抽出された期日が今日より前の日付になっていました。',
      hint: '「2週間後」「来月末」など、未来の日付になる表現を使ってください。',
      raw,
    };
  }
  if (
    lower.includes('contract_output_invalid_json') ||
    lower.includes('missing') ||
    lower.includes('amountjpyc') ||
    lower.includes('deadline') ||
    lower.includes('parse') ||
    lower.includes('zoderror')
  ) {
    return {
      code: 'missing_info',
      title: '発注に必要な情報が足りません',
      detail:
        '受注者・金額・期日・業務内容のいずれかを Contract Agent が読み取れませんでした。',
      hint: '下のサンプル文をクリックすると、必要な要素が揃った文章に置き換わります。',
      raw,
    };
  }
  if (lower.includes('orderid_mismatch') || lower.includes('issue_body_missing')) {
    return {
      code: 'issue_body_missing_marker',
      title: 'Issue 作成中に内部エラーが発生しました',
      detail: 'もう一度発注を試してください。問題が続く場合は管理者に連絡してください。',
      raw,
    };
  }

  return {
    code: 'unknown',
    title: '発注に失敗しました',
    detail:
      raw
        ? `Contract Agent からのメッセージ: ${raw}`
        : `HTTP ${status} が返されました。`,
    hint: '時間を置いて再試行するか、サンプル文を使ってみてください。',
    raw,
  };
}
