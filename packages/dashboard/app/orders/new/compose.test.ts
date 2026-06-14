import { describe, it, expect } from 'vitest';
import { composeOrderText } from './compose';

describe('composeOrderText', () => {
  it('composes a full natural-language order from structured fields', () => {
    const text = composeOrderText({
      workerDisplayName: 'Mameta29',
      repository: 'Mameta29/agentic-gig-flow',
      amountJpyc: '50000',
      deadline: '1週間後',
      description: 'Dashboard 発注フォームの改善',
      acceptanceCriteria: '既存テストがすべて通る、CIが通過している',
    });
    // Worker, repository, amount, deadline, description and criteria must all
    // survive into the text Contract Agent parses.
    expect(text).toContain('Mameta29 さんに');
    expect(text).toContain('Dashboard 発注フォームの改善 を');
    expect(text).toContain('50,000 JPYC で');
    expect(text).toContain('1週間後 まで');
    expect(text).toContain('リポジトリは Mameta29/agentic-gig-flow。');
    expect(text).toContain(
      '受け入れ基準: 既存テストがすべて通る、CIが通過している。',
    );
  });

  it('formats the amount with thousands separators', () => {
    const text = composeOrderText({
      workerDisplayName: 'Sato Taro',
      repository: 'Mameta29/gigflow-demo-workspace',
      amountJpyc: '80000',
      deadline: '3週間後',
      description: 'リファクタ',
    });
    expect(text).toContain('80,000 JPYC');
  });

  it('omits optional acceptance criteria when empty', () => {
    const text = composeOrderText({
      workerDisplayName: 'Sato Taro',
      repository: 'Mameta29/gigflow-demo-workspace',
      amountJpyc: '30000',
      deadline: '1週間後',
      description: 'バグ修正',
    });
    expect(text).not.toContain('受け入れ基準');
  });

  it('drops a non-numeric amount instead of emitting NaN', () => {
    const text = composeOrderText({
      workerDisplayName: 'Sato Taro',
      repository: 'Mameta29/gigflow-demo-workspace',
      amountJpyc: 'abc',
      deadline: '1週間後',
      description: 'バグ修正',
    });
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('JPYC で');
  });
});
