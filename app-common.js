function todayLocalISO() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

async function fetchConfig() {
  const res = await fetch('/api/config');
  return res.json();
}

function fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtMoneyPrecise(n) {
  return '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SERIES_COLORS = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948'
];
