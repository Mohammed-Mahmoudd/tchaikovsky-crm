export type LeadCashValidationResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

export interface CashEntry {
  id: string;
  amount: number;
  currency?: string;
  recordedBy: string;
  recordedByUserId?: string;
  recordedByRole?: string;
  recordedAt: number;
  note?: string;
  isLegacy?: boolean;
  isVoided?: boolean;
  voidedAt?: number | null;
  voidedBy?: string;
  voidedByUserId?: string;
  voidReason?: string;
}

export type CashAttributionSource =
  | "entry"
  | "cash_recorded_by"
  | "activity_log"
  | "enrolled_by"
  | "unattributed";

export interface ResolvedCashPayment {
  id: string;
  amount: number;
  actor: string;
  recordedByUserId?: string;
  timestamp: number;
  note: string;
  isLegacy: boolean;
  attributionSource: CashAttributionSource;
}

export interface CashResolvableConversation {
  cashIn?: number | null;
  cashRecordedBy?: string | null;
  cashEntries?: ReadonlyArray<CashEntry> | null;
  enrolledBy?: string | null;
  paidAt?: string | number | null;
  enrolledAt?: string | number | null;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
  lastMessageAt?: number | null;
  source?:
    | {
        campaign?: string;
        adset?: string;
        ad?: string;
        cashIn?: number | null;
        cashRecordedBy?: string | null;
        enrolledBy?: string | null;
        paidAt?: string | number | null;
        enrolledAt?: string | number | null;
        activityLog?: ReadonlyArray<{
          id?: string;
          type?: string;
          actor?: string;
          timestamp?: number | string;
        }>;
      }
    | string
    | null;
  activityLog?: ReadonlyArray<{
    id?: string;
    type?: string;
    actor?: string;
    timestamp?: number | string;
  }> | null;
}

export function isRealCashActor(name?: string | null): boolean;
export function parseLeadCashInput(raw: string): LeadCashValidationResult;
export function parseAddCashInput(raw: string): LeadCashValidationResult;
export function formatLeadCashInputValue(cashIn?: number | null): string;
export function formatLeadCashLabel(cashIn?: number | null): string | null;
export function resolveConversationCashPayments(
  c?: CashResolvableConversation | null
): ResolvedCashPayment[];
export function computeActiveCashTotal(
  c?: CashResolvableConversation | null
): number;
export function getCashEntriesSignature(
  entries?: ReadonlyArray<CashEntry> | null
): string;

