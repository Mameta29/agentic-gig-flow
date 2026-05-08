export type JournalEntry = {
  debit: { account: string; amount: number };
  credit: { account: string; amount: number };
  description: string;
  dateLocal: string;
};

export type WithholdingDecision = {
  applies: boolean;
  rate?: number;
  amountJpyc?: number;
  rationale: string;
};

export type BookkeepingArtifacts = {
  journalEntry: JournalEntry;
  withholding: WithholdingDecision;
  paymentStatementMarkdown: string;
  needsHumanReview: boolean;
  generatedAt: string;
};
