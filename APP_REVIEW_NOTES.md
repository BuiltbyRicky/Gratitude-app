# App Review Notes — Gratitude

> Copy the text inside the **Reviewer-facing notes** block below into App Store Connect → *App Information* → *App Review Information* → *Notes* when submitting. The other sections in this file are guidance for the submitter and should NOT be pasted.

---

## Reviewer-facing notes

Hello, and thank you for reviewing Gratitude.

Gratitude is a daily voice-journaling app that helps users build a reflection habit. Users answer a short set of prompts each day — by speaking or typing — and the app surfaces patterns, streaks, and mood trends over time.

**App architecture.** Gratitude is built with Capacitor 8, which wraps a web layer (HTML/CSS/JavaScript) inside a native iOS host. We rely on real native APIs for the user-visible features — this is not a website packaged as an app. Specifically, we use:

- **AVFoundation / SFSpeechRecognizer** for voice journaling. Microphone audio is converted to text on-device and the audio buffer is not retained; only the resulting text is saved to the user's entry.
- **HealthKit** to write completed reflection sessions as Mindful Minutes. We only request *write* permission — we never read user health data. The pre-permission explainer shown in-app makes this promise to the user.
- **Core Motion** for an opt-in shake-to-capture gesture that lets users quickly record a gratitude note without opening the app to a specific screen.
- **UserNotifications** for the optional daily reminder.
- **Core Haptics** for subtle tactile feedback on key interactions.
- **PhotoKit** when a user attaches a photo to an entry.

**Account creation & data.** Sign-in uses email + password via Supabase. We do not offer third-party SSO, so Sign in with Apple is not required under Guideline 4.8. Entries are stored encrypted in transit on the user's row of our `entries` table; only the user can read their own entries.

**Account deletion.** Per Guideline 5.1.1(v), users can fully delete their account from inside the app at *Settings → Account → Delete my account*. This triggers an Edge Function that removes the auth record and cascades all entry data — it is not a sign-out disguised as a deletion.

**Subscriptions.** The premium tier (monthly and yearly auto-renewable subscriptions) is sold exclusively through Apple In-App Purchase. There are no external payment flows in the app.

**Test account.** Please use the credentials below to skip sign-up and explore a populated account:

- Email: `<APPLE_REVIEW_EMAIL>`
- Password: `<APPLE_REVIEW_PASSWORD>`

This account has several recent journal entries so the Insights, History, and Year-in-Review screens have meaningful data to display.

**Demo notes for specific surfaces.**
- *Voice journaling:* Tap the microphone icon on a journal prompt and speak. Permissions for Microphone and Speech Recognition are requested the first time.
- *Apple Health logging:* When a session is completed, you may be prompted to connect to Apple Health. Approving this lets the app log the session as Mindful Minutes. The app does not read anything from Health.
- *Shake-to-capture:* If the device permission has been granted, shaking the phone opens a quick-capture sheet. This is an opt-in feature.

If anything is unclear or if you'd like additional context on a specific feature, please reach out to gratitudejournaling101@gmail.com and we will respond within one business day.

Thank you again for your time and care in reviewing this build.

---

## Submitter checklist (do not paste into App Store Connect)

Before submitting, replace placeholders and verify:

- [ ] Create the reviewer test account in Supabase Auth.
- [ ] Populate it with 3–5 sample entries spanning recent dates so Insights/History/Year-in-Review are non-empty.
- [ ] Replace `<APPLE_REVIEW_EMAIL>` and `<APPLE_REVIEW_PASSWORD>` above with the actual credentials.
- [ ] Confirm the in-app *Delete my account* flow still works end-to-end against the live Supabase project.
- [ ] Confirm the build version in Xcode matches what you intend to submit.
- [ ] If the IAP migration has shipped, double-check that the paywall references App Store Connect product IDs and not Stripe price IDs.
- [ ] PrivacyInfo.xcprivacy is bundled in the App target (check Build Phases → Copy Bundle Resources).

## What this document does NOT cover

- App Store metadata (description, keywords, screenshots, support URL) — entered separately in App Store Connect.
- Marketing copy or in-app onboarding — out of scope for reviewer notes.
- Privacy nutrition label answers — those are entered as a separate questionnaire in App Store Connect and should be consistent with PrivacyInfo.xcprivacy.
