"use client";

import { useActionState } from "react";
import { formatFcfa } from "shared";
import { formatDepartureDateTime } from "../_shared";
import { markVoucherProcessed, type MarkVoucherProcessedState } from "./actions";

export type RefundPendingVoucherRow = {
  voucher_id: string;
  user_email: string | null;
  amount_fcfa: number;
  refund_pending_amount_fcfa: number | null;
  refund_pending_at: string | null;
  origin_booking_reference: string;
};

const initialState: MarkVoucherProcessedState = { error: null };

function VoucherRow({ voucher }: { voucher: RefundPendingVoucherRow }) {
  const [state, action, pending] = useActionState(markVoucherProcessed, initialState);

  return (
    <tr className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
        {voucher.origin_booking_reference}
      </td>
      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{voucher.user_email ?? "—"}</td>
      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
        {formatFcfa(voucher.refund_pending_amount_fcfa ?? voucher.amount_fcfa)}
      </td>
      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
        {voucher.refund_pending_at ? formatDepartureDateTime(voucher.refund_pending_at) : "—"}
      </td>
      <td className="px-4 py-3">
        <form action={action} className="flex flex-col items-start gap-1">
          <input type="hidden" name="voucherId" value={voucher.voucher_id} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {pending ? "…" : "Marquer comme traité"}
          </button>
          {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
        </form>
      </td>
    </tr>
  );
}

export function RemboursementsTable({ vouchers }: { vouchers: RefundPendingVoucherRow[] }) {
  if (vouchers.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Aucun avoir en attente de remboursement.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full min-w-[800px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="px-4 py-3 font-medium">Réservation d&apos;origine</th>
            <th className="px-4 py-3 font-medium">Client</th>
            <th className="px-4 py-3 font-medium">Montant</th>
            <th className="px-4 py-3 font-medium">En attente depuis</th>
            <th className="px-4 py-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {vouchers.map((voucher) => (
            <VoucherRow key={voucher.voucher_id} voucher={voucher} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
