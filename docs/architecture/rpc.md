# Supabase RPC

Full per-function signatures, `SECURITY DEFINER`/`INVOKER` mode, and grants, one file per domain under [`rpc/`](rpc/):

- [lessons](rpc/lessons.md) — `assert_lesson_participant_counts`, `create_lesson_with_participants`, `create_lesson_series_with_participants`, `update_lesson_with_participants`, `update_lesson_rider_notes`, `cancel_rider_participation`, `get_lesson_rider_notes`, `get_lesson_payment_info`, `generate_lesson_for_series`
- [horses](rpc/horses.md) — `update_horse_details`, `update_horse_photo`, `update_horse_notes`, `get_horse_exertion_summary`, `get_horse_projected_exhaustion`, `get_lesson_horse_exertion_levels`, `get_lesson_horse_exertion_levels_batch`, `revoke_horse_privilege`, `set_horse_owner`
- [members](rpc/members.md) — `create_managed_member`, `claim_managed_member`, `set_can_instruct`, `get_instructor_membership_names`, `get_active_barn_member_summaries`
- [agreements](rpc/agreements.md) — `create_agreement_with_first_charge`, `generate_agreement_charge`, `mark_agreement_charge_paid`, `update_agreement_charge_fee`
- [transactions](rpc/transactions.md) — `sync_lesson_transactions`, `collect_lesson_payment`, `delete_lesson_with_transactions`, `delete_expense_with_transactions`, `sync_rider_cancellation_fee`, `cancel_lesson_with_transactions`, `get_outstanding_transactions`, `collect_rider_cancellation_fee`, `sync_expense_transaction`
- [expenses](rpc/expenses.md) — `create_expense_with_horses`, `update_expense_with_horses`
- [tiers](rpc/tiers.md) — `set_default_tier`, `set_instructor_cut`
- [notifications](rpc/notifications.md) — `create_or_update_notification`, `get_unread_notification_title`
- [calendar](rpc/calendar.md) — `get_calendar_feed`
- [dev](rpc/dev.md) — `teardown_dev_barn_lessons`, `teardown_all_lesson_data`
