import { HDate, getSedra } from '@hebcal/core';
import { TANACH_PARSHIOT } from './tanachParshiot.js';

const PARSHAH_BY_ORDER = new Map(TANACH_PARSHIOT.map(parsha => [parsha.canonicalOrder, parsha]));

/**
 * The annual schedule differs outside Israel in years where a second festival
 * day falls on Shabbat. Israel is the app default; deployments can set
 * TANACH_PARASHAH_SCHEDULE=diaspora without changing the discovery contract.
 */
export function isIsraelParshahSchedule(value = process.env.TANACH_PARASHAH_SCHEDULE) {
  return String(value || 'israel').trim().toLowerCase() !== 'diaspora';
}

/**
 * Resolve the regular upcoming (or current Shabbat) Torah reading to the local
 * inclusive portion ranges. Holiday readings intentionally have no range:
 * they do not correspond to a weekly parashah in the stored 54-portion table.
 */
export function getCurrentWeeklyParshah({ date = new Date(), isIsrael = isIsraelParshahSchedule() } = {}) {
  const today = new HDate(date);
  const sedra = getSedra(today.getFullYear(), isIsrael).lookup(today);
  if (sedra.chag || !Array.isArray(sedra.num)) {
    const order = typeof sedra.num === 'number' ? [sedra.num] : [];
    const portions = order.map(number => PARSHAH_BY_ORDER.get(number)).filter(Boolean);
    return portions.length ? serializeWeeklyParshah(portions, sedra, isIsrael) : null;
  }

  const portions = sedra.num.map(number => PARSHAH_BY_ORDER.get(number)).filter(Boolean);
  return portions.length ? serializeWeeklyParshah(portions, sedra, isIsrael) : null;
}

function serializeWeeklyParshah(portions, sedra, isIsrael) {
  return {
    id: portions.map(portion => portion.id).join('--'),
    ids: portions.map(portion => portion.id),
    nameHe: portions.map(portion => portion.nameHe).join('–'),
    portions,
    isIsrael,
    shabbatDate: sedra.hdate.greg().toISOString().slice(0, 10),
  };
}