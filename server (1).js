const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const SALES_FILE = path.join(DATA_DIR, 'sales.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function loadJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadConfig() {
  return migrateConfig(loadJSON(CONFIG_FILE, {}));
}

// Helper to build a line entry when a rate doesn't vary by new/renewal or
// bundled/monoline (a "flat" carrier).
function flatLine(name, pct, note) {
  return { name, monolineNewPct: pct, monolineRenewalPct: pct, bundledNewPct: pct, bundledRenewalPct: pct, note: note || '' };
}

// ---- Real contracted carrier commission rates ----
// Entered from Zach's actual carrier agreements/schedules (Aug 2026) and his
// direct instructions. Each carrier can pay a different rate per line of
// business, per new-vs-renewal, and per bundled-vs-monoline — see each
// carrier's `notes` field for the source and any caveats/assumptions made.
// Where a real contract ties the rate to an agency-wide performance tier
// (Travelers Partnership Level, Foremost Offering Level) or a per-policy
// underwriting tier (Liberty Mutual), the LOWEST available tier is used,
// per Zach ("whatever the lowest tier is for now, only 2nd month live") —
// revisit these once the agency has enough production/loss history to
// qualify for a better tier.
const DEFAULT_CARRIERS = [
  {
    name: 'Travelers',
    notes: 'Quantum 2.0 & Specialty Lines schedule, effective 4/1/2026, Illinois ("All Except Below" state group), lowest (Agency) Partnership Level. Auto pays a flat 10% at the Agency tier regardless of bundling. Revisit once Northline qualifies for Premier or Signature — those pay meaningfully more, especially on bundled Home/Landlord/Boat.',
    lines: [
      { name: 'Auto', monolineNewPct: 10, monolineRenewalPct: 10, bundledNewPct: 10, bundledRenewalPct: 10 },
      { name: 'Home', monolineNewPct: 10, monolineRenewalPct: 10, bundledNewPct: 13, bundledRenewalPct: 13 },
      { name: 'Landlord', monolineNewPct: 10, monolineRenewalPct: 10, bundledNewPct: 13, bundledRenewalPct: 13 },
      { name: 'Umbrella (PLUS)', monolineNewPct: 10, monolineRenewalPct: 10, bundledNewPct: 10, bundledRenewalPct: 10 },
      { name: 'Boat/Yacht (Quantum)', monolineNewPct: 10, monolineRenewalPct: 10, bundledNewPct: 13, bundledRenewalPct: 13 },
      { name: 'Boat (non-Quantum)', monolineNewPct: 20, monolineRenewalPct: 20, bundledNewPct: 20, bundledRenewalPct: 20 },
      { name: 'Homesaver (Dwelling Fire)', monolineNewPct: 12, monolineRenewalPct: 12, bundledNewPct: 12, bundledRenewalPct: 12 },
      { name: 'Personal Articles', monolineNewPct: 12, monolineRenewalPct: 12, bundledNewPct: 12, bundledRenewalPct: 12 }
    ]
  },
  {
    name: 'Liberty Mutual',
    notes: "Illinois schedule (rates for policies incepted on/after 1/1/2024). \"Bundled\" is mapped to LM's \"with auto\" rate and \"Monoline\" to \"without auto\" where LM distinguishes them. The LOWEST underwriting/coverage tier is used per line (Lower Commission for Auto, Essential for Home) as a placeholder — LM's real per-policy rate depends on a risk tier (Premier/Ultra down to Lower Commission) this tool doesn't track per policy, so actual revenue may run higher than shown here. Also: if Northline writes fewer than 24 new Auto/Home policies in a calendar year, LM drops to a flat 12% new / 10% renewal the following April 1 through March 31 — not yet triggered with no prior-year data, but will apply eventually.",
    lines: [
      { name: 'Auto (PPA)', monolineNewPct: 10, monolineRenewalPct: 8, bundledNewPct: 10, bundledRenewalPct: 8, note: 'Lower Commission tier (lowest); moves up to Essential (12/10), Superior/Enhanced (15/12), or Premier/Ultra (15/15) with better risk quality.' },
      { name: 'Homeowners', monolineNewPct: 15, monolineRenewalPct: 10, bundledNewPct: 15, bundledRenewalPct: 12, note: 'Essential tier (lowest); Optimum/New Quality-Plus and Premier/Ultra pay more, especially on renewal.' },
      { name: 'Landlord Protection', monolineNewPct: 15, monolineRenewalPct: 12, bundledNewPct: 15, bundledRenewalPct: 15 },
      { name: 'Renters/Condo', monolineNewPct: 15, monolineRenewalPct: 12, bundledNewPct: 15, bundledRenewalPct: 15 },
      { name: 'Umbrella/Watercraft', monolineNewPct: 15, monolineRenewalPct: 15, bundledNewPct: 15, bundledRenewalPct: 15 },
      { name: 'Motorcycle & Off-Road', monolineNewPct: 17, monolineRenewalPct: 10, bundledNewPct: 17, bundledRenewalPct: 10 },
      { name: 'Pet Insurance', monolineNewPct: 13, monolineRenewalPct: 6, bundledNewPct: 13, bundledRenewalPct: 6 },
      { name: 'Earthquake', monolineNewPct: 5, monolineRenewalPct: 5, bundledNewPct: 5, bundledRenewalPct: 5 }
    ]
  },
  {
    name: 'Foremost Signature',
    notes: 'IMPORTANT — unresolved: this schedule (effective 3/1/25) explicitly EXCLUDES Illinois ("Countrywide Excluding AZ, IL, IN, NJ & WI"), so these are placeholder numbers only, not Northline\'s confirmed IL rates. Confirm the real Illinois schedule with your Foremost rep and update this in Settings. Value Plus (lowest Offering Level), Agency (Non-Group) row shown; "Package" mapped to Bundled, "Non-package" to Monoline.',
    lines: [
      { name: 'Auto/Home', monolineNewPct: 10, monolineRenewalPct: 8, bundledNewPct: 12, bundledRenewalPct: 11, note: 'Value Plus tier — IL rate unconfirmed, see carrier note.' },
      { name: 'Umbrella/Landlord', monolineNewPct: 15, monolineRenewalPct: 14, bundledNewPct: 15, bundledRenewalPct: 14 },
      { name: 'Toys (motorhome/boat/motorcycle/trailer)', monolineNewPct: 14, monolineRenewalPct: 12, bundledNewPct: 14, bundledRenewalPct: 12 }
    ]
  },
  {
    name: 'Mercury',
    notes: "From the actual signed Agency Contract (Mercury Insurance Company of Illinois, dated 8/17/2026). Auto floor: 12% new / 10% renewal unless 12+ new PPA policies are written in the trailing 12 months; No-Prior-Insurance auto business is locked at 10% for the life of the policy — neither is modeled per-policy here. A separate Contingent Commission Bonus (profit-sharing on growth % and loss ratio, requires $300k+ eligible earned premium nationally, pays the following April) is NOT included in these rates or in this tool's totals.",
    lines: [
      { name: 'Personal Auto', monolineNewPct: 14, monolineRenewalPct: 12, bundledNewPct: 17, bundledRenewalPct: 12, note: 'Bundled New = base 14% + a 3-point new-business-only bonus for an active Mercury Home/Condo/Renters policy; the bonus does not apply to renewals.' },
      { name: 'Homeowners', monolineNewPct: 15, monolineRenewalPct: 12, bundledNewPct: 15, bundledRenewalPct: 15 },
      { name: 'Personal Umbrella', monolineNewPct: 14, monolineRenewalPct: 12, bundledNewPct: 14, bundledRenewalPct: 12 }
    ]
  },
  {
    name: 'Progressive',
    notes: 'Per Zach: new-business rate is 13% but he flagged it could actually be 12% — confirm with your Progressive rep. Renewal at 10% is firm. Progressive doesn\'t distinguish bundled vs. monoline here.',
    lines: [
      { name: 'General', monolineNewPct: 13, monolineRenewalPct: 10, bundledNewPct: 13, bundledRenewalPct: 10, note: 'New-business % unconfirmed — could be 12% instead of 13%.' }
    ]
  },
  {
    name: 'Orion 180',
    notes: 'Flat 13% on everything, per Zach.',
    lines: [flatLine('General', 13)]
  },
  {
    name: 'Steadily',
    notes: 'Flat 15% on everything, per Zach.',
    lines: [flatLine('General', 15)]
  },
  {
    name: 'National General',
    notes: 'Rate not yet known — Zach still needs to confirm the actual commission with National General. Set to 0% as a placeholder so revenue isn\'t overstated in the meantime; update this in Settings as soon as it\'s confirmed.',
    lines: [flatLine('General', 0, 'TBD — placeholder until confirmed')]
  },
  {
    name: 'Beyond Flood (National General Flood)',
    notes: 'Flat 13% on flood, per Zach.',
    lines: [flatLine('Flood', 13)]
  },
  {
    name: 'Branch',
    notes: "Per Zach: monoline Home pays 15%, and a Home+Auto bundle pays 16% on the Home and 15% on the Auto. A standalone (monoline) Auto rate wasn't given — placeholder 0% until confirmed.",
    lines: [
      { name: 'Home', monolineNewPct: 15, monolineRenewalPct: 15, bundledNewPct: 16, bundledRenewalPct: 16 },
      { name: 'Auto', monolineNewPct: 0, monolineRenewalPct: 0, bundledNewPct: 15, bundledRenewalPct: 15, note: 'Monoline (auto-only) rate not provided — placeholder 0% until confirmed; bundled 15% is confirmed.' }
    ]
  }
];

// ---- Seed default config ----
if (!fs.existsSync(CONFIG_FILE)) {
  saveJSON(CONFIG_FILE, {
    pin: '1234',
    agencyName: 'Northline Insurance Group',
    carriers: DEFAULT_CARRIERS,
    agents: ['Agent 1', 'Agent 2', 'Agent 3'],
    holidays: [],
    teamsWebhookUrl: '',
    reportTimezone: 'America/Chicago',
    reportTimes: ['08:00', '17:00'],
    reportMode: 'revenue',
    agencyGoal: { revenueGoal: null, premiumGoal: null },
    agentGoals: {}
  });
}

if (!fs.existsSync(SALES_FILE)) {
  saveJSON(SALES_FILE, []);
}

// One-time migrations so older saved configs upgrade automatically without
// losing anything an agent already entered in Settings.
function migrateConfig(config) {
  let changed = false;
  config.carriers = (config.carriers || []).map(c => {
    let carrier = c;
    // v1 shape: a single flat commissionPct -> carry forward as both
    // monoline and bundled.
    if (carrier.commissionPct !== undefined && carrier.monolineCommissionPct === undefined) {
      changed = true;
      const { commissionPct, ...rest } = carrier;
      carrier = { ...rest, monolineCommissionPct: commissionPct, bundledCommissionPct: commissionPct };
    }
    // v2 shape: flat monoline/bundled rates (no line-of-business or
    // new-vs-renewal split) -> wrap into a single "General" line.
    if (carrier.monolineCommissionPct !== undefined && !carrier.lines) {
      changed = true;
      const { monolineCommissionPct, bundledCommissionPct, ...rest } = carrier;
      carrier = {
        ...rest,
        lines: [flatLine('General', undefined)].map(l => ({
          ...l,
          monolineNewPct: Number(monolineCommissionPct) || 0,
          monolineRenewalPct: Number(monolineCommissionPct) || 0,
          bundledNewPct: Number(bundledCommissionPct) || 0,
          bundledRenewalPct: Number(bundledCommissionPct) || 0
        }))
      };
    }
    return carrier;
  });
  if (!config.agencyGoal) {
    changed = true;
    config.agencyGoal = { revenueGoal: null, premiumGoal: null };
  }
  if (!config.agentGoals) {
    changed = true;
    config.agentGoals = {};
  }
  if (changed) saveJSON(CONFIG_FILE, config);
  return config;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Helpers ----
function todayLocalISO() {
  // Server-side fallback only; client always sends its own local date.
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function requirePin(req, res, next) {
  const config = loadConfig();
  const pin = req.headers['x-pin'] || req.body?.pin;
  if (!config.pin || pin === config.pin) return next();
  return res.status(401).json({ error: 'Invalid PIN' });
}

// ---- Config endpoints ----
app.get('/api/config', (req, res) => {
  const config = loadConfig();
  // Don't leak the pin or the Teams webhook URL to a public GET — anyone who
  // can view the dashboard could otherwise grab it and spam the channel.
  const { pin, teamsWebhookUrl, ...rest } = config;
  res.json({ ...rest, pinSet: !!pin, teamsWebhookConfigured: !!teamsWebhookUrl });
});

app.put('/api/config', requirePin, (req, res) => {
  const config = loadConfig();
  const updated = { ...config, ...req.body };
  // never allow blanking the pin accidentally
  if (!updated.pin) updated.pin = config.pin;
  // blank webhook field in the form means "leave it as-is", not "clear it" —
  // send teamsWebhookUrl: null explicitly (handled by the settings UI's
  // "Remove" action) to actually clear it.
  if (!updated.teamsWebhookUrl) updated.teamsWebhookUrl = config.teamsWebhookUrl || '';
  if (req.body?.teamsWebhookUrl === null) updated.teamsWebhookUrl = '';
  saveJSON(CONFIG_FILE, updated);
  const { pin, teamsWebhookUrl, ...rest } = updated;
  res.json({ ...rest, pinSet: !!pin, teamsWebhookConfigured: !!teamsWebhookUrl });
});

// ---- File upload (policy application / declarations page) ----
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const ok = /pdf|png|jpe?g|heic|heif/i.test(path.extname(file.originalname));
    cb(ok ? null : new Error('Only PDF or image files (PDF, PNG, JPG, HEIC) are accepted'), ok);
  }
});

// Looks up the commission % for a carrier given the line of business, new
// vs. renewal, and bundled vs. monoline. Falls back to the carrier's first
// configured line if the requested line isn't found (e.g. free-text legacy
// data), and to 0 if the carrier has no lines configured at all.
function commissionRateFor(carrierConfig, lineOfBusiness, bundled, newOrRenewal) {
  if (!carrierConfig || !Array.isArray(carrierConfig.lines) || !carrierConfig.lines.length) return 0;
  const line = carrierConfig.lines.find(l => l.name === lineOfBusiness) || carrierConfig.lines[0];
  const isRenewal = newOrRenewal === 'renewal';
  const key = bundled
    ? (isRenewal ? 'bundledRenewalPct' : 'bundledNewPct')
    : (isRenewal ? 'monolineRenewalPct' : 'monolineNewPct');
  return Number(line[key]) || 0;
}

function lineNamesFor(carrierConfig) {
  return Array.isArray(carrierConfig?.lines) ? carrierConfig.lines.map(l => l.name) : [];
}

// ---- Sales endpoints ----
app.get('/api/sales', (req, res) => {
  let sales = loadJSON(SALES_FILE, []);
  const { start, end, agent, carrier, status } = req.query;
  if (start) sales = sales.filter(s => s.dateSold >= start);
  if (end) sales = sales.filter(s => s.dateSold <= end);
  if (agent) sales = sales.filter(s => s.agent === agent);
  if (carrier) sales = sales.filter(s => s.carrier === carrier);
  if (status) sales = sales.filter(s => s.verificationStatus === status);
  sales.sort((a, b) => (a.dateSold < b.dateSold ? 1 : -1));
  res.json(sales);
});

app.post('/api/sales', requirePin, (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, (req, res) => {
  const sales = loadJSON(SALES_FILE, []);
  const config = loadConfig();
  const { dateSold, agent, carrier, policyType, premium, policyNumber, clientName, notes, bundled, newOrRenewal } = req.body;

  if (!dateSold || !agent || !carrier || premium === undefined || premium === null || premium === '') {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'dateSold, agent, carrier, and premium are required' });
  }
  const premiumNum = Number(premium);
  if (Number.isNaN(premiumNum) || premiumNum < 0) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'premium must be a positive number' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'A copy of the policy application/declarations page is required' });
  }

  const isBundled = bundled === 'true' || bundled === true;
  const isRenewal = newOrRenewal === 'renewal';
  const carrierConfig = (config.carriers || []).find(c => c.name === carrier);
  const commissionPct = commissionRateFor(carrierConfig, policyType, isBundled, newOrRenewal);
  const revenue = Math.round(premiumNum * (commissionPct / 100) * 100) / 100;

  const record = {
    id: crypto.randomUUID(),
    dateSold,
    dateLogged: new Date().toISOString(),
    agent,
    carrier,
    policyType: policyType || '',
    newOrRenewal: isRenewal ? 'renewal' : 'new',
    policyNumber: policyNumber || '',
    clientName: clientName || '',
    notes: notes || '',
    bundled: isBundled,
    premium: premiumNum,
    commissionPct,
    revenue,
    documentFile: req.file.filename,
    documentOriginalName: req.file.originalname,
    verificationStatus: 'pending', // 'pending' | 'verified' | 'flagged'
    verifiedAt: null,
    verificationNotes: ''
  };
  sales.push(record);
  saveJSON(SALES_FILE, sales);
  res.status(201).json(record);
});

app.delete('/api/sales/:id', requirePin, (req, res) => {
  let sales = loadJSON(SALES_FILE, []);
  const target = sales.find(s => s.id === req.params.id);
  const before = sales.length;
  sales = sales.filter(s => s.id !== req.params.id);
  saveJSON(SALES_FILE, sales);
  if (target?.documentFile) {
    fs.unlink(path.join(UPLOADS_DIR, target.documentFile), () => {});
  }
  res.json({ deleted: before - sales.length });
});

// ---- Document access (view the attached policy application) ----
app.get('/api/sales/:id/document', (req, res) => {
  const sales = loadJSON(SALES_FILE, []);
  const sale = sales.find(s => s.id === req.params.id);
  if (!sale || !sale.documentFile) return res.status(404).json({ error: 'No document on file' });
  const filePath = path.join(UPLOADS_DIR, sale.documentFile);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Document file missing' });
  res.sendFile(filePath);
});

// ---- Verification: mark a logged sale verified, or flag a mismatch ----
// No PIN required for now (per agency preference) — anyone with the link can
// review and confirm/flag a submitted sale.
app.post('/api/sales/:id/verify', (req, res) => {
  const sales = loadJSON(SALES_FILE, []);
  const idx = sales.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Sale not found' });

  const { action, notes, correctedPremium, correctedCarrier, correctedPolicyType, correctedNewOrRenewal, correctedBundled, reviewerName } = req.body;
  if (!['verify', 'flag'].includes(action)) {
    return res.status(400).json({ error: 'action must be "verify" or "flag"' });
  }

  const sale = sales[idx];
  const config = loadConfig();

  // Allow the reviewer to correct anything that drives the commission
  // calculation against what the document actually shows, recalculating
  // commission and revenue to match.
  let recalc = false;
  if (correctedPremium !== undefined && correctedPremium !== '' && !Number.isNaN(Number(correctedPremium))) {
    sale.premium = Number(correctedPremium);
    recalc = true;
  }
  if (correctedCarrier) {
    sale.carrier = correctedCarrier;
    recalc = true;
  }
  if (correctedPolicyType) {
    sale.policyType = correctedPolicyType;
    recalc = true;
  }
  if (correctedNewOrRenewal === 'new' || correctedNewOrRenewal === 'renewal') {
    sale.newOrRenewal = correctedNewOrRenewal;
    recalc = true;
  }
  if (correctedBundled !== undefined) {
    sale.bundled = correctedBundled === 'true' || correctedBundled === true;
    recalc = true;
  }
  if (recalc) {
    const carrierConfig = (config.carriers || []).find(c => c.name === sale.carrier);
    sale.commissionPct = commissionRateFor(carrierConfig, sale.policyType, sale.bundled, sale.newOrRenewal);
    sale.revenue = Math.round(sale.premium * (sale.commissionPct / 100) * 100) / 100;
  }

  sale.verificationStatus = action === 'verify' ? 'verified' : 'flagged';
  sale.verifiedAt = new Date().toISOString();
  sale.verificationNotes = notes || '';
  sale.reviewedBy = reviewerName || '';

  sales[idx] = sale;
  saveJSON(SALES_FILE, sales);
  res.json(sale);
});

// ---- Summary endpoint ----
app.get('/api/summary', (req, res) => {
  let sales = loadJSON(SALES_FILE, []);
  const { start, end } = req.query;
  if (start) sales = sales.filter(s => s.dateSold >= start);
  if (end) sales = sales.filter(s => s.dateSold <= end);

  const totalPolicies = sales.length;
  const totalPremium = round2(sales.reduce((sum, s) => sum + s.premium, 0));
  const totalRevenue = round2(sales.reduce((sum, s) => sum + s.revenue, 0));
  const pendingCount = sales.filter(s => s.verificationStatus === 'pending').length;
  const flaggedCount = sales.filter(s => s.verificationStatus === 'flagged').length;

  const byCarrier = groupSum(sales, 'carrier');
  const byAgent = groupSum(sales, 'agent');
  const byDay = {};
  sales.forEach(s => {
    if (!byDay[s.dateSold]) byDay[s.dateSold] = { date: s.dateSold, policies: 0, premium: 0, revenue: 0 };
    byDay[s.dateSold].policies += 1;
    byDay[s.dateSold].premium += s.premium;
    byDay[s.dateSold].revenue += s.revenue;
  });
  const dailySeries = Object.values(byDay)
    .map(d => ({ ...d, premium: round2(d.premium), revenue: round2(d.revenue) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  res.json({
    totalPolicies,
    totalPremium,
    totalRevenue,
    pendingCount,
    flaggedCount,
    byCarrier,
    byAgent,
    dailySeries
  });
});

function groupSum(sales, key) {
  const map = {};
  sales.forEach(s => {
    const k = s[key] || 'Unknown';
    if (!map[k]) map[k] = { name: k, policies: 0, premium: 0, revenue: 0 };
    map[k].policies += 1;
    map[k].premium += s.premium;
    map[k].revenue += s.revenue;
  });
  return Object.values(map)
    .map(v => ({ ...v, premium: round2(v.premium), revenue: round2(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---- Business-day / pacing helpers ----
// Counts Monday–Friday, minus any dates listed in config.holidays (ISO
// "YYYY-MM-DD" strings) — e.g. so a company holiday doesn't count toward
// the pacing basis. Manage the holiday list from Settings.
function isBusinessDay(y, m, d, holidaySet) {
  const day = new Date(Date.UTC(y, m, d)).getUTCDay();
  if (day < 1 || day > 5) return false;
  if (holidaySet && holidaySet.has(isoFromParts(y, m, d))) return false;
  return true;
}

function isoFromParts(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getHolidaySet(config) {
  return new Set(config.holidays || []);
}

function businessDaysInMonth(y, m, holidaySet) {
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) if (isBusinessDay(y, m, d, holidaySet)) count++;
  return count;
}

// Business days completed BEFORE today (today's own partial day is excluded
// from the pace basis, same convention as the Salesforce goal report).
function businessDaysElapsed(y, m, todayDay, holidaySet) {
  let count = 0;
  for (let d = 1; d < todayDay; d++) if (isBusinessDay(y, m, d, holidaySet)) count++;
  return count;
}

function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
}

function monthKey(iso) {
  return iso.slice(0, 7); // YYYY-MM
}

function sumMetrics(sales) {
  return {
    policies: sales.length,
    premium: round2(sales.reduce((s, r) => s + r.premium, 0)),
    revenue: round2(sales.reduce((s, r) => s + r.revenue, 0))
  };
}

function computePacing(sales, todayISO, holidaySet) {
  const { y, m, d } = parseISODate(todayISO);
  const mKey = monthKey(todayISO);

  const todaySales = sales.filter(s => s.dateSold === todayISO);
  const mtdSales = sales.filter(s => monthKey(s.dateSold) === mKey && s.dateSold <= todayISO);

  const totalBizDays = businessDaysInMonth(y, m, holidaySet);
  let elapsedBizDays = businessDaysElapsed(y, m, d, holidaySet);
  // If today is the first business day of the month (or the month opens on a
  // weekend and today is day 1-2), there's no completed day yet to pace off
  // of — fall back to 1 so we don't divide by zero, using today's own MTD
  // total as the basis (best available signal that early in the month).
  const paceBasisDays = elapsedBizDays > 0 ? elapsedBizDays : 1;

  const mtd = sumMetrics(mtdSales);
  const today = sumMetrics(todaySales);

  const runRate = {
    premium: round2((mtd.premium / paceBasisDays) * totalBizDays),
    revenue: round2((mtd.revenue / paceBasisDays) * totalBizDays)
  };

  return {
    today,
    mtd,
    runRate,
    businessDaysInMonth: totalBizDays,
    businessDaysElapsed: elapsedBizDays
  };
}

// ---- Goal pacing: % to goal (red/yellow/green) + $ needed/day to hit it ----
// % to goal compares the RUN RATE (the projected pace for the full month) to
// the goal, not just today's raw MTD — that's what tells you whether you're
// on track to hit it, not just how much you've sold so far.
function goalStatusFromPct(pct) {
  if (pct === null || pct === undefined) return null;
  if (pct < 71) return 'red';
  if (pct < 100) return 'yellow';
  return 'green';
}

// Mutates `pacing` (the object returned by computePacing) in place, adding
// .goal, .percentToGoal, and .neededPerDay for both premium and revenue.
// `goals` is a { revenueGoal, premiumGoal } object (or null/undefined if
// nothing configured for this agency/producer yet).
function attachGoalMetrics(pacing, goals) {
  const metrics = [
    { key: 'premium', goalField: 'premiumGoal' },
    { key: 'revenue', goalField: 'revenueGoal' }
  ];
  pacing.goal = {};
  pacing.percentToGoal = {};
  pacing.neededPerDay = {};
  metrics.forEach(({ key, goalField }) => {
    const goalVal = goals && goals[goalField] != null && goals[goalField] !== ''
      ? Number(goals[goalField])
      : null;
    pacing.goal[key] = goalVal;
    if (!goalVal || Number.isNaN(goalVal)) {
      pacing.percentToGoal[key] = null;
      pacing.neededPerDay[key] = null;
      return;
    }
    const pct = round2((pacing.runRate[key] / goalVal) * 100);
    pacing.percentToGoal[key] = { pct, status: goalStatusFromPct(pct) };
    // Business days left to still hit the goal, including today.
    const remainingDays = Math.max(pacing.businessDaysInMonth - pacing.businessDaysElapsed, 1);
    const remainingAmount = goalVal - pacing.mtd[key];
    pacing.neededPerDay[key] = remainingAmount > 0 ? round2(remainingAmount / remainingDays) : 0;
  });
  return pacing;
}

// ---- Pacing endpoint: agency total + per-agent breakdown ----
app.get('/api/pacing', (req, res) => {
  const sales = loadJSON(SALES_FILE, []);
  const config = loadConfig();
  const today = req.query.today || todayLocalISO();
  const holidaySet = getHolidaySet(config);

  const agency = computePacing(sales, today, holidaySet);
  agency.pendingCount = sales.filter(s => s.verificationStatus === 'pending').length;
  agency.flaggedCount = sales.filter(s => s.verificationStatus === 'flagged').length;
  attachGoalMetrics(agency, config.agencyGoal);

  const agents = config.agents && config.agents.length
    ? config.agents
    : [...new Set(sales.map(s => s.agent))];

  const byAgent = agents.map(agent => {
    const agentSales = sales.filter(s => s.agent === agent);
    const pacing = computePacing(agentSales, today, holidaySet);
    attachGoalMetrics(pacing, (config.agentGoals || {})[agent]);
    return { agent, ...pacing };
  }).sort((a, b) => b.mtd.revenue - a.mtd.revenue);

  res.json({ today, agency, byAgent });
});

// ---- Daily report: plain-text summary for morning/EOD updates ----
function buildReport(today, mode) {
  const sales = loadJSON(SALES_FILE, []);
  const config = loadConfig();
  const holidaySet = getHolidaySet(config);

  const agency = computePacing(sales, today, holidaySet);
  const pendingCount = sales.filter(s => s.verificationStatus === 'pending').length;
  const flaggedCount = sales.filter(s => s.verificationStatus === 'flagged').length;
  attachGoalMetrics(agency, config.agencyGoal);
  const agents = config.agents && config.agents.length
    ? config.agents
    : [...new Set(sales.map(s => s.agent))];
  const byAgent = agents.map(agent => {
    const agentSales = sales.filter(s => s.agent === agent);
    const pacing = computePacing(agentSales, today, holidaySet);
    attachGoalMetrics(pacing, (config.agentGoals || {})[agent]);
    return { agent, ...pacing };
  }).sort((a, b) => b.mtd[mode] - a.mtd[mode]);

  const money = n => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const label = mode === 'premium' ? 'Premium' : 'Revenue';
  const statusEmoji = { red: '🔴', yellow: '🟡', green: '🟢' };
  // A short "% to goal 🟢 | need $X/day" suffix, or '' if no goal is set for
  // this mode — keeps the report clean for agents/agencies without a goal.
  const goalSuffix = (pacing) => {
    const p = pacing.percentToGoal && pacing.percentToGoal[mode];
    if (!p) return '';
    const emoji = statusEmoji[p.status] || '';
    const needed = pacing.neededPerDay[mode];
    const neededText = needed > 0 ? ` | Need ${money(needed)}/business day to hit goal` : ' | On pace to hit goal';
    return ` | ${p.pct}% to goal ${emoji}${neededText}`;
  };

  const lines = [];
  lines.push(`${config.agencyName || 'Agency'} — Daily Sales Report`);
  lines.push(`As of ${today} (${agency.businessDaysElapsed}/${agency.businessDaysInMonth} business days completed this month)`);
  lines.push('');
  lines.push(`Agency ${label} Today: ${money(agency.today[mode])}`);
  lines.push(`Agency ${label} MTD: ${money(agency.mtd[mode])}`);
  lines.push(`Agency Run Rate (pace for the month): ${money(agency.runRate[mode])}`);
  if (agency.goal[mode]) {
    lines.push(`Agency Goal: ${money(agency.goal[mode])}${goalSuffix(agency)}`);
  }
  lines.push(`Policies Today: ${agency.today.policies}  |  Policies MTD: ${agency.mtd.policies}`);
  if (pendingCount || flaggedCount) {
    lines.push(`Needs review: ${pendingCount} pending verification, ${flaggedCount} flagged`);
  }
  lines.push('');
  lines.push('By Producer:');
  byAgent.forEach(a => {
    lines.push(`  ${a.agent} — Today: ${money(a.today[mode])} (${a.today.policies} pol) | MTD: ${money(a.mtd[mode])} | Run Rate (pace for the month): ${money(a.runRate[mode])}${goalSuffix(a)}`);
  });

  return { today, mode, agency, byAgent, text: lines.join('\n') };
}

app.get('/api/report', (req, res) => {
  const today = req.query.today || todayLocalISO();
  const mode = req.query.mode === 'premium' ? 'premium' : 'revenue';
  res.json(buildReport(today, mode));
});

// ---- Microsoft Teams delivery ----
// Posts { text: "<report>" } to the channel Workflow's webhook URL. In Teams,
// set up "Post to a channel when a webhook request is received", generate its
// schema from a sample body of {"text":"sample"}, then map the `text` field
// into a "Post message in a channel" action (as plain Text, not Adaptive Card).
// Teams' current "Workflows" incoming webhook expects an Adaptive Card
// payload (the older plain {"text": "..."} shape used by the legacy Office
// 365 Connector gets rejected). Render one TextBlock per line so the report
// keeps its line breaks; bold the first line as a title.
function buildTeamsAdaptiveCard(text) {
  const lines = text.split('\n');
  // This Teams "Workflows" webhook posts the request body directly as an
  // Adaptive Card (via its own "Post card in a chat or channel" step) — it
  // does NOT want the {"type":"message","attachments":[...]} bot-framework
  // envelope. The card object itself must be the top-level JSON body.
  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body: lines.map((line, i) => ({
      type: 'TextBlock',
      text: line.length ? line : ' ',
      wrap: true,
      weight: i === 0 ? 'bolder' : 'default',
      size: i === 0 ? 'medium' : 'default',
      spacing: line.length ? 'small' : 'none'
    }))
  };
}

async function postReportToTeams(mode) {
  const config = loadConfig();
  if (!config.teamsWebhookUrl) return { skipped: true, reason: 'No Teams webhook URL configured' };

  const tz = config.reportTimezone || 'America/Chicago';
  const today = timezoneTodayISO(tz);
  const report = buildReport(today, mode || config.reportMode || 'revenue');

  const resp = await fetch(config.teamsWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildTeamsAdaptiveCard(report.text))
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Teams webhook responded ${resp.status}: ${body.slice(0, 300)}`);
  }
  return { sent: true, today, mode: report.mode };
}

app.post('/api/send-teams-report', requirePin, async (req, res) => {
  try {
    const config = loadConfig();
    const mode = req.body?.mode || config.reportMode || 'revenue';
    const result = await postReportToTeams(mode);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Timezone-aware clock helpers for the scheduler ----
function timezoneTodayISO(tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date()); // en-CA formats as YYYY-MM-DD
}

function timezoneNowHHMM(tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date()); // HH:MM
}

// ---- Scheduler: checks every 30s, fires each configured time once per day ----
const lastSentKey = {}; // e.g. { "08:00": "2026-08-18" }
function startScheduler() {
  setInterval(async () => {
    const config = loadConfig();
    if (!config.teamsWebhookUrl || !config.reportTimes || !config.reportTimes.length) return;

    const tz = config.reportTimezone || 'America/Chicago';
    const nowHHMM = timezoneNowHHMM(tz);
    const today = timezoneTodayISO(tz);

    for (const slot of config.reportTimes) {
      if (nowHHMM === slot && lastSentKey[slot] !== today) {
        lastSentKey[slot] = today; // mark immediately to avoid double-send within the match window
        try {
          await postReportToTeams(config.reportMode || 'revenue');
          console.log(`[scheduler] Sent Teams report for ${slot} on ${today}`);
        } catch (err) {
          console.error(`[scheduler] Failed to send Teams report for ${slot}:`, err.message);
        }
      }
    }
  }, 30 * 1000);
}

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Northline policy dashboard running on port ${PORT}`);
  startScheduler();
});
