# Northline Policy Sales Dashboard

A lightweight web app so your team can log every bound policy the moment it's sold —
independent of when your AMS shows it as effective — and see live totals by
carrier, agent, premium, and revenue.

## What's inside

- **Log a Sale** page — agents fill this out right after they bind a policy,
  and must attach a copy of the policy application or declarations page — see
  **Verification** below.
- **Verify** page — review each submitted policy document against what the
  agent entered, correct anything that's off (premium, carrier), and mark it
  verified or flag a mismatch.
- **Dashboard** page — a pacing panel (revenue/premium today, MTD, and run rate,
  both agency-wide and per producer), a sales-by-day chart, revenue by
  carrier/agent, a filterable table with verification status, and CSV export.
- **Daily Report** page — a ready-to-paste text summary (agency + per-producer
  today/MTD/run rate) for a manual update, if you ever want one outside the
  automatic schedule.
- **Automatic Teams report** — the same report, posted straight into a
  Microsoft Teams channel at whatever two times you set (defaults to 8:00 AM
  and 5:00 PM Central), no copy-paste needed. See **Setting up automatic Teams
  delivery** below.
- **Settings** page — manage your carrier list, per-line commission rates
  (new/renewal × monoline/bundled), agent list, company holidays (excluded
  from pacing), the shared PIN, and the Teams webhook/schedule.

Revenue is calculated as `premium × carrier commission %`, where the rate
comes from the carrier, the line of business the agent picked, whether it's
new business or a renewal, and whether it's bundled with another line — see
**A note on commission rates** below. Agent-split math is intentionally left
out — you said you'll handle that in your accounting tool.

### Verification

Every logged sale must have a policy application or declarations page attached
(PDF, PNG, JPG, or HEIC) — that's what a reviewer checks the entered carrier,
premium, and bind status against. A sale shows up on the dashboard and counts
toward every total **immediately**, marked "Pending," so nothing gets delayed
waiting on review — that would just recreate the AMS-lag problem this tool
exists to solve. Go to **Verify** to review pending sales: you can correct the
premium or carrier right there if the document shows something different (the
revenue recalculates automatically), then mark it **Verified** or **Flag** it
with a note if something doesn't add up. There's no PIN required to review for
now, by agency preference — anyone with the link can verify or flag. The
dashboard shows a banner whenever sales are waiting on review, and the daily
report includes a "needs review" line so it's never silently forgotten.

### Run rate math

Run rate = `(month-to-date total ÷ business days completed) × total business
days in the month`, where "business days" means Monday–Friday minus anything
in your Settings holiday list. "Completed" means business days strictly
before today — today's own partial numbers aren't included in the pace
basis, so the run rate doesn't dip artificially early in the day. This
mirrors how the Salesforce goal report calculated it.

Data is stored in plain JSON files under `data/` (`sales.json`, `config.json`) — no
database setup needed. A shared PIN (default `1234`, **change this in Settings
immediately**) gates who can log or delete sales and change settings; anyone with
the link can *view* the dashboard.

## Run it locally (to try it out first)

```
npm install
npm start
```

Then open `http://localhost:3000`.

## Get a live public URL your agents can use — no coding required

The easiest free option is **Render**:

1. Go to [render.com](https://render.com) and sign up (free).
2. Click **New +** → **Web Service**.
3. Choose **"Deploy from a Git repository"** — if you don't have this in a repo
   yet, first push this folder to a new GitHub repo (GitHub Desktop makes this
   easy with no command line), or ask me and I'll walk you through it.
4. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
5. Click **Create Web Service**. In a couple minutes you'll get a URL like
   `https://northline-dashboard.onrender.com` — bookmark that on every agent's phone/laptop.

**Important:** Render's free tier spins down after inactivity and — more
importantly — its filesystem is **not persistent**, so your `data/` folder
resets on redeploy. For a small agency this is usually fine for a quick
trial, but for real day-to-day use you'll want either:
- Render's paid tier with a persistent disk attached (a few dollars/month), or
- A small always-on host (a $5/mo VPS, or an office PC left running) so
  `data/sales.json` never gets wiped.

Alternative (also free, and simpler for non-developers): **Replit**.
1. Go to [replit.com](https://replit.com), sign up, click **Create Repl** → **Import from GitHub** (or "Upload folder" and drag this whole project in).
2. Click **Run**. Replit auto-detects `npm start` and gives you a live URL immediately.
3. Turn on **"Always On"** (small paid add-on) so the app — and its saved data — doesn't sleep between uses.

Either way, once it's live: change the PIN in **Settings** right away, add your
real carriers/commission rates and agent names, and share the URL with your team.

## Setting up automatic Teams delivery

This takes about 2 minutes and only needs to be done once. It uses a native
Teams feature (a channel "Workflow"), not a third-party app — no Power
Automate flow that touches your sales data, just a private URL that receives
a finished report and posts it.

**In Microsoft Teams** (needs edit rights on the channel — doesn't require a
tenant admin):

1. Go to the channel you want reports posted in → click the **•••** (more
   options) next to the channel name → **Workflows**.
2. Search for and select **"Post to a channel when a webhook request is
   received"**.
3. Sign in if prompted, pick this Team and channel as the destination, and
   click **Create flow** / **Add workflow**.
4. Teams will show you a **webhook URL** — copy it. (If it later asks you to
   define the incoming request's schema, choose "generate from sample" and
   paste in: `{"text": "sample report text"}` — that tells the workflow to
   expect a field called `text`.)

**In the dashboard:**

1. Go to **Settings** → the **Automatic Teams report** card.
2. Paste the webhook URL, set your two send times and timezone (defaults to
   8:00 AM / 5:00 PM Central), choose whether to lead with Revenue or
   Premium, enter your PIN, and click **Save Teams settings**.
3. Click **Send test report now** to confirm it lands in the channel.

From then on, the app posts the report itself at both times, every day,
automatically — nothing to remember or paste.

**Reliability note:** the schedule only fires while the app is actually
running, so whichever free host you use (Render/Replit) needs its
**"Always On"** option enabled rather than the sleep-when-idle free tier —
same requirement mentioned above for not losing your data.

## Day-to-day workflow this solves

Your AMS only shows a policy once it's *effective*, which can be weeks after
your agent actually sold it. This app decouples "I know a sale happened" from
the AMS entirely:

1. Agent binds a policy → immediately logs it here (30 seconds).
2. You see it on the dashboard **today**, correctly dated to the day it was sold.
3. Weeks later, when the AMS shows the policy as effective, use that only to
   reconcile — confirm the commission actually paid, catch anything that got
   logged wrong, add the policy number if it wasn't known yet.

## Customizing

- Carriers, per-line commission rates, agent names, holidays, and Teams
  delivery: **Settings** page.
- Colors/branding: `public/style.css`.
- Want a PIN gate on verification, agent-level login (instead of one shared
  PIN), email/text delivery instead of (or alongside) Teams, or
  auto-reconciliation against an AMS export file — all doable as a v4, just
  let me know.

## A note on commission rates

Commission rates now vary per carrier, per line of business (Auto, Home,
Umbrella, etc.), new business vs. renewal, and bundled vs. monoline — set
each combination under **Settings** → the carrier's line table (Mono New %,
Mono Renew %, Bundle New %, Bundle Renew %). When you log a sale, pick the
carrier, then the line of business (the dropdown populates from that
carrier's configured lines), new/renewal, and whether it's bundled — the
right rate is looked up automatically.

The rates currently seeded come from Zach's real carrier contracts/schedules
and direct instructions (entered August 2026), at the lowest available tier
where a carrier's rate depends on an agency-wide performance tier or
per-policy underwriting tier — Northline is a new, unrated agency, so this is
the conservative starting point. A few things still need confirming or
watching; each carrier's **Notes** field in Settings has the full detail, but
in short:

- **Foremost Signature** — the schedule on file explicitly *excludes*
  Illinois. The Value Plus rates entered are a placeholder only; get the real
  IL schedule from your Foremost rep and update Settings.
- **Liberty Mutual** — real per-policy commission depends on a risk/coverage
  tier (Premier/Ultra down to Lower Commission) this tool doesn't track per
  policy; the lowest tier is used as a conservative estimate, so actual
  revenue may run a bit higher. Also watch the <24-new-policies/year rule,
  which drops LM to a flat 12%/10% the following April if it's ever
  triggered.
- **Progressive** — new-business rate is entered as 13% but may actually be
  12%; confirm and correct if needed.
- **National General** — rate unknown; set to 0% as a placeholder so revenue
  isn't overstated. Update as soon as you have it.
- **Branch** — monoline (standalone) Auto rate wasn't provided; set to 0%
  placeholder. The Home and bundled Home+Auto rates are confirmed.
- **Mercury** — from the actual signed agency contract, including the
  auto-bundling new-business bonus. Its separate Contingent Commission Bonus
  (profit-sharing on growth/loss ratio, paid the following April) is *not*
  modeled here — too lagging and complex for a real-time tool.

None of the above blocks the tool from working today — they just mean a
handful of numbers are best-guess placeholders until confirmed. Add, edit, or
remove carriers and lines freely in Settings as your appointments change.
