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
