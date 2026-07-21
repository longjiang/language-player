# {$title.profile}

Your profile page shows account info, language level, subscription status, watch history, and saved words — all in one place.

## Account Info

At the top of the page you'll see your display name and email address. This is the information tied to your account — it's what you used when you signed up.

## Language Level

The **{$title.settings}** section lets you set your proficiency level for the current target language. Choose from the dropdown to match your ability:

- **{$lang.zh}** shows {$level.exam_hsk} levels (1 through 7-9)
- **{$lang.ja}** shows {$level.exam_jlpt} levels (Pre-N5 through N1)
- **{$lang.ko}** shows {$level.exam_topik} levels (Pre-1 through 6)
- **{$lang.en}** shows {$level.exam_ielts} levels (1 through 9)
- **All other languages** show {$level.exam_cefr} levels (Pre-A1 through C2)

Your level is used to filter video recommendations on the [{$title.explore}](/docs/media/explore) page and to color-code difficulty badges on video cards. You can change it anytime — your recommendations update immediately.

## Subscription

The **{$title.subscription}** section shows your current plan and lets you manage it.

### Free Account

If you're on a free account, you'll see a **{$label.free_account}** badge and three plan cards — Monthly ($10/mo), Annual ($90/yr), and Lifetime ($169). Click **{$action.upgrade_to_pro}** to go to the [{$title.go_pro}](/docs/account/billing) page and choose a plan.

### Active Pro Subscription

If you have an active subscription, you'll see:

- A **{$subscription.monthly_cap}**, **{$subscription.annual_cap}**, or **{$subscription.lifetime_cap}** badge
- Days remaining until renewal (monthly and annual plans)
- An **{$label.auto_renews}** badge if auto-renewal is on
- The payment method used (Stripe, PayPal, or Apple App Store)

From here you can:

- **{$action.cancel_auto_renewal}** — stops auto-renewal at the end of your current billing period. Your Pro access stays active until then.
- **{$action.upgrade}** — switch from Monthly to Annual, or from any plan to Lifetime
- **{$action.upgrade_to_lifetime}** — a one-time $169 payment for permanent Pro access

### Expired Subscription

If your subscription has ended, you'll see a red expired badge and a **{$action.renew}** button. All your saved words, watch history, and settings are preserved — just renew to pick up where you left off.

## Watch History

The **{$title.watch_history}** section shows the last 5 videos you watched, with thumbnails and durations. Click any video to resume playback from where you left off, with your full watch history loaded as a queue.

Click **{$action.see_all}** to open the full [{$title.watch_history}](/docs/media/watch-history) page, where you can browse, search, and replay every video you've watched in this language.

## Saved Words

The **{$title.saved_words}** section shows your 10 most recently saved words for the current target language. Each entry shows the word and the video it came from — click a word to open its dictionary entry, or click **{$action.see_all}** to browse your full vocabulary on the [{$title.saved_words}](/docs/vocab/saved-words) page.

## Tips

- Your language level is per-language — setting your {$lang.zh} level to {$level.exam_hsk} 3 won't affect your {$lang.ja} level
- The {$title.watch_history} and {$title.saved_words} sections only show content for the current target language — switch L2 in the header to see other languages
- {$msg.money_back_guarantee} [{$action.contact_us}](mailto:jon.long@zerotohero.ca)
- Cancelling auto-renewal keeps your Pro features active until the end of your billing period — nothing is interrupted early
