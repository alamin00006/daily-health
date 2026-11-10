-- Receipts are RC-…, payouts ST-… (PY-/PO- read like patient IDs of people named Y…/O…).
ALTER TABLE "payments"."Payment" DROP CONSTRAINT "Payment_invoiceNo_format_check";
ALTER TABLE "payments"."Payment" ADD CONSTRAINT "Payment_invoiceNo_format_check"
  CHECK ("invoiceNo" ~ '^RC-[0-9]{4}-[0-9]{4,}$');
ALTER TABLE "payments"."Payout" DROP CONSTRAINT "Payout_payoutNo_format_check";
ALTER TABLE "payments"."Payout" ADD CONSTRAINT "Payout_payoutNo_format_check"
  CHECK ("payoutNo" ~ '^ST-[0-9]{4}-[0-9]{4,}$');
