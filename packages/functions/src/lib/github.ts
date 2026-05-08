import { Octokit } from '@octokit/rest';
import { env } from './env.js';
import { getSecret } from './key-vault.js';

let octokit: Octokit | null = null;

export async function getOctokit(): Promise<Octokit> {
  if (octokit) return octokit;
  const token = await getSecret(env.githubPatSecretName());
  octokit = new Octokit({ auth: token });
  return octokit;
}

function parseRepo(repoFullName: string): { owner: string; repo: string } {
  const [owner, repo] = repoFullName.split('/');
  if (!owner || !repo) throw new Error(`bad repo name: ${repoFullName}`);
  return { owner, repo };
}

export async function createIssue(opts: {
  repository: string;
  title: string;
  body: string;
  assignee?: string;
  labels?: string[];
}): Promise<{ number: number; url: string }> {
  const o = await getOctokit();
  const { owner, repo } = parseRepo(opts.repository);
  const res = await o.issues.create({
    owner,
    repo,
    title: opts.title,
    body: opts.body,
    assignees: opts.assignee ? [opts.assignee] : undefined,
    labels: opts.labels,
  });
  return { number: res.data.number, url: res.data.html_url };
}

export async function getIssueBody(opts: {
  repository: string;
  issueNumber: number;
}): Promise<string> {
  const o = await getOctokit();
  const { owner, repo } = parseRepo(opts.repository);
  const res = await o.issues.get({
    owner,
    repo,
    issue_number: opts.issueNumber,
  });
  return res.data.body ?? '';
}

export async function getPrDiff(opts: {
  repository: string;
  prNumber: number;
  maxBytes?: number;
}): Promise<{ diff: string; truncated: boolean }> {
  const o = await getOctokit();
  const { owner, repo } = parseRepo(opts.repository);
  const res = await o.pulls.get({
    owner,
    repo,
    pull_number: opts.prNumber,
    mediaType: { format: 'diff' },
  });
  const raw = String(res.data);
  const max = opts.maxBytes ?? 50 * 1024;
  if (raw.length > max) {
    return { diff: raw.slice(0, max), truncated: true };
  }
  return { diff: raw, truncated: false };
}

export async function getPr(opts: {
  repository: string;
  prNumber: number;
}): Promise<{
  number: number;
  title: string;
  body: string;
  author: string;
  headSha: string;
  state: string;
  merged: boolean;
}> {
  const o = await getOctokit();
  const { owner, repo } = parseRepo(opts.repository);
  const res = await o.pulls.get({
    owner,
    repo,
    pull_number: opts.prNumber,
  });
  return {
    number: res.data.number,
    title: res.data.title,
    body: res.data.body ?? '',
    author: res.data.user?.login ?? '',
    headSha: res.data.head.sha,
    state: res.data.state,
    merged: res.data.merged ?? false,
  };
}

export async function submitReview(opts: {
  repository: string;
  prNumber: number;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  body: string;
}): Promise<void> {
  const o = await getOctokit();
  const { owner, repo } = parseRepo(opts.repository);
  await o.pulls.createReview({
    owner,
    repo,
    pull_number: opts.prNumber,
    event: opts.event,
    body: opts.body,
  });
}

export async function mergePr(opts: {
  repository: string;
  prNumber: number;
  commitTitle: string;
  commitMessage?: string;
}): Promise<{ merged: boolean; sha: string }> {
  const o = await getOctokit();
  const { owner, repo } = parseRepo(opts.repository);
  const res = await o.pulls.merge({
    owner,
    repo,
    pull_number: opts.prNumber,
    commit_title: opts.commitTitle,
    commit_message: opts.commitMessage,
    merge_method: 'squash',
  });
  return { merged: !!res.data.merged, sha: res.data.sha };
}

export async function getCheckRunStatus(opts: {
  repository: string;
  ref: string;
}): Promise<'success' | 'failure' | 'pending'> {
  const o = await getOctokit();
  const { owner, repo } = parseRepo(opts.repository);
  const res = await o.checks.listForRef({ owner, repo, ref: opts.ref });
  if (res.data.total_count === 0) return 'pending';
  const conclusions = res.data.check_runs.map((c) => c.conclusion);
  if (conclusions.some((c) => c === 'failure' || c === 'timed_out' || c === 'cancelled'))
    return 'failure';
  if (conclusions.every((c) => c === 'success' || c === 'neutral' || c === 'skipped'))
    return 'success';
  return 'pending';
}

const ORDER_ID_RE = /<!--\s*gigflow:orderId=([0-9a-fA-F-]{36})\s*-->/;

export function extractOrderIdFromIssueBody(
  body: string,
): string | undefined {
  const m = body.match(ORDER_ID_RE);
  return m?.[1];
}

/**
 * Verify GitHub webhook HMAC-SHA256 signature.
 * Header: X-Hub-Signature-256: sha256=<hex>
 */
export async function verifyWebhookSignature(
  body: string,
  signatureHeader: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const provided = signatureHeader.slice('sha256='.length);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // constant-time compare
  if (hex.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) {
    diff |= hex.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}
