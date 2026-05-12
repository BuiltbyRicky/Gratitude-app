# Reviewer test account — setup steps

Goal: create a Supabase auth user whose credentials you can paste into `APP_REVIEW_NOTES.md` for Apple's App Review team, with a small history of entries so Insights / History / Year-in-Review have something to display.

## Step 1 — Create the auth user in Supabase

You cannot insert directly into `auth.users` via SQL; user creation goes through the dashboard.

1. Open https://supabase.com/dashboard/project/epfewpuxztzbpzwmvzkx/auth/users
2. Click **Add user** → *Create new user*
3. Enter:
   - **Email:** `appreview@ironrockcapitalventures.com` (or any address you control — plus-addressing on your Gmail works fine too, e.g. `gratitudejournaling101+appreview@gmail.com`)
   - **Password:** something memorable but non-trivial, e.g. `AppleReview2026!`
   - **Auto-confirm user:** ✅ check this so the account doesn't need email verification
4. Click **Create user**
5. Note the new user's **UID** (visible in the user list — it's a UUID like `a1b2c3d4-...`). You'll paste it into the SQL in Step 2.

## Step 2 — Seed sample entries

Open the SQL editor: https://supabase.com/dashboard/project/epfewpuxztzbpzwmvzkx/sql/new

Paste the block below. **Replace `'PASTE_USER_UID_HERE'` (3 occurrences after substitution) with the UID from Step 1**, then click **Run**.

```sql
-- Seed 5 sample journal entries for the App Review test account.
-- Run AFTER creating the auth user in the dashboard.
-- Replace PASTE_USER_UID_HERE with the new user's auth.users.id (UUID).

DO $$
DECLARE
  reviewer_uid uuid := 'PASTE_USER_UID_HERE';
  fixed_qs jsonb := '[
    "What is one thing you''re genuinely grateful for today?",
    "Who made a positive difference in your life recently, and why?",
    "What''s something small that brought you joy or comfort today?"
  ]'::jsonb;
BEGIN
  -- Wipe any existing rows for this reviewer account so the seed is idempotent.
  DELETE FROM entries WHERE user_id = reviewer_uid;

  -- Today's entry — most recent, full mood arc (3 → 5)
  INSERT INTO entries (user_id, date, questions, answers, mood_before, mood_after) VALUES (
    reviewer_uid,
    NOW(),
    fixed_qs,
    '[
      "The morning quiet before anyone else was awake. I made coffee and just sat with the sound of the kettle, which felt rare and like a small luxury.",
      "My sister sent a long voice memo about how her week went. We don''t live close anymore and hearing her voice settled something I didn''t know was unsettled.",
      "The light coming through the kitchen window when I was washing dishes. It made the soap bubbles look gold for about ten seconds."
    ]'::jsonb,
    3, 5
  );

  -- 2 days ago — full mood arc (2 → 4)
  INSERT INTO entries (user_id, date, questions, answers, mood_before, mood_after) VALUES (
    reviewer_uid,
    NOW() - INTERVAL '2 days',
    fixed_qs,
    '[
      "Finishing the proposal I''d been putting off for three weeks. It''s not perfect but it''s done and out of my head.",
      "A coworker who could have stayed out of a meeting I was struggling in and instead stepped in to back me up without making it a thing.",
      "A really hot shower after a cold walk home. The simplest thing and it felt like a reward."
    ]'::jsonb,
    2, 4
  );

  -- 5 days ago — mood_after only (4)
  INSERT INTO entries (user_id, date, questions, answers, mood_before, mood_after) VALUES (
    reviewer_uid,
    NOW() - INTERVAL '5 days',
    fixed_qs,
    '[
      "My dog, who is getting old, slept with his head on my foot the whole time I worked. He doesn''t do that for anyone else.",
      "My old roommate from college, who still texts me random songs she thinks I''d like even though we haven''t lived together in five years.",
      "A clean kitchen at the end of a long day — I almost skipped doing the dishes and I''m so glad I didn''t."
    ]'::jsonb,
    NULL, 4
  );

  -- 12 days ago — full mood arc (3 → 4)
  INSERT INTO entries (user_id, date, questions, answers, mood_before, mood_after) VALUES (
    reviewer_uid,
    NOW() - INTERVAL '12 days',
    fixed_qs,
    '[
      "A book I started this week is actually good. I''d almost forgotten how much I miss reading for pleasure.",
      "My neighbor who watered the plants while I was gone last weekend without me having to ask.",
      "The first warm day where I could open the windows. The apartment smelled different and it made me happy."
    ]'::jsonb,
    3, 4
  );

  -- 25 days ago — mood_before only (3)
  INSERT INTO entries (user_id, date, questions, answers, mood_before, mood_after) VALUES (
    reviewer_uid,
    NOW() - INTERVAL '25 days',
    fixed_qs,
    '[
      "Taking myself to yoga even though I almost talked myself out of it. I''m always glad I went.",
      "An old friend who called out of nowhere. We''d been ships passing in the night for months and finally caught up properly.",
      "Folding laundry while listening to an album end to end. A small contained task that ended cleanly."
    ]'::jsonb,
    3, NULL
  );
END $$;

-- Confirm 5 rows landed:
SELECT date, mood_before, mood_after, LEFT(answers::text, 60) AS preview
FROM entries
WHERE user_id = 'PASTE_USER_UID_HERE'
ORDER BY date DESC;
```

You should see 5 rows in the result, dated today / -2d / -5d / -12d / -25d.

## Step 3 — Paste credentials into App Review Notes

Open `APP_REVIEW_NOTES.md`, find the two placeholder lines:

```
- Email: `<APPLE_REVIEW_EMAIL>`
- Password: `<APPLE_REVIEW_PASSWORD>`
```

Replace with the credentials you just created. Commit the change with something like `Add reviewer test account credentials to App Review Notes`.

## Step 4 — Smoke-test the account

Sign in to the app as the reviewer (in Simulator is fine):

- ✅ Home screen shows a streak / recent entries
- ✅ History shows 5 entries spanning the last ~25 days. **As a free user (no Premium yet) only the entries from the last 7 days appear**, with a locked card for the older 3. That's by design — the reviewer needs to see the gating behavior.
- ✅ Insights / Year-in-Review trigger the paywall (good — proves gating works)
- ✅ Mood chart on home shows some variation across the seeded mood values

If anything doesn't render, the seed didn't take and the SELECT at the bottom of Step 2 will be empty.

## Why this approach

- Doesn't touch `auth.users` directly (Supabase doesn't support that via SQL anyway — dashboard is the supported path)
- Idempotent: the `DELETE` at the top means you can re-run the seed any time without duplicates
- Realistic-looking entries that won't seem like obvious filler to a reviewer
- Covers all three Insights inputs (mood pairs, mood single, mood missing) so the mood chart isn't empty
- Spans far enough back (25 days) to make Year-in-Review and history work meaningfully
