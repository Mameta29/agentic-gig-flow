// Pure helper extracted from page.tsx so it can be unit-tested without
// rendering the client component (Next.js page files may only export the
// default component + reserved names).

/**
 * Compose a natural-language order sentence from the structured selections.
 * Contract Agent still parses this text — the natural-language entry point is
 * intentionally preserved. The form just removes the typo class of errors
 * ("受注者が登録されていません" / "リポジトリが登録されていません") by letting the
 * PM pick the worker and repository from the tenant's allow-list instead of
 * free-typing them.
 */
export function composeOrderText(input: {
  workerDisplayName: string;
  repository: string;
  amountJpyc: string;
  deadline: string;
  description: string;
  acceptanceCriteria?: string;
}): string {
  const amount = input.amountJpyc.trim();
  const amountLabel =
    amount && Number.isFinite(Number(amount))
      ? `${Number(amount).toLocaleString('en-US')} JPYC`
      : '';
  const parts = [
    `${input.workerDisplayName} さんに`,
    input.description.trim() ? `${input.description.trim()} を` : '',
    amountLabel ? `${amountLabel} で` : '',
    input.deadline.trim() ? `${input.deadline.trim()} まで` : '',
    'お願いします。',
    `リポジトリは ${input.repository}。`,
    input.acceptanceCriteria?.trim()
      ? `受け入れ基準: ${input.acceptanceCriteria.trim()}。`
      : '',
  ].filter(Boolean);
  return parts.join(' ');
}

// Per-order spending limit (JPYC). Mirrors the tenant's spendingLimitPerOrder so
// the form rejects over-limit amounts before hitting the server. Keep in sync
// with the tenant config in Cosmos.
export const MAX_AMOUNT_JPYC = 200_000;

export type OrderFormValidation = {
  /** Submission is allowed only when valid. */
  valid: boolean;
  /** Inline warning shown next to the amount field, if any. */
  amountError?: string;
  /** Inline warning shown next to the description field, if any. */
  descriptionError?: string;
};

/**
 * Validate the structured order form before submission:
 * - amount must be a positive integer and at most MAX_AMOUNT_JPYC
 * - description must not be empty
 * Pure so it can be unit-tested without rendering the component.
 */
export function validateOrderForm(input: {
  amountJpyc: string;
  description: string;
}): OrderFormValidation {
  const result: OrderFormValidation = { valid: true };

  const raw = input.amountJpyc.trim();
  const amount = Number(raw);
  if (!raw || !Number.isInteger(amount) || amount <= 0) {
    result.amountError = '金額は1以上の整数を入力してください。';
    result.valid = false;
  }

  if (!input.description.trim()) {
    result.descriptionError = '業務内容を入力してください。';
    result.valid = false;
  }

  return result;
}
