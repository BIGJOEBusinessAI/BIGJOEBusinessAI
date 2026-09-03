# BIGJOE v30.2 — Loyalty Spent Calculation Fix

## What changed
- Customer Loyalty **Spent** now comes from the customer's qualifying completed POS sales.
- Cancelled and returned sales are excluded automatically.
- The value is exposed as `total_spent` by the loyalty overview API.
- The Loyalty UI now displays `total_spent` instead of an unavailable `total` field.
- Transaction count is also included in the loyalty overview data.

## Expected behaviour
- New completed sale: Spent increases by the sale total.
- Additional completed sale: Spent accumulates.
- Returned sale: Spent decreases because the returned sale is excluded.
- Reward redemption does not change Spent.
- Loyalty points continue to follow the existing earn/reversal ledger logic.

## Test checklist
1. Open Customer Loyalty and note a customer's Spent amount.
2. Complete a customer sale and refresh Loyalty — Spent should increase.
3. Return that sale — Spent should decrease back to the prior net amount.
4. Redeem a reward — Spent should remain unchanged while Redeemed increases.
