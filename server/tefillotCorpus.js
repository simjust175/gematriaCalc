const FESTIVALS = [
  { slug: 'pesach', label: 'פסח', order: 3 },
  { slug: 'shavuot', label: 'שבועות', order: 4 },
  { slug: 'sukkot', label: 'סוכות', order: 5 },
  { slug: 'shemini-atzeret', label: 'שמיני עצרת', order: 6 },
  { slug: 'simchat-torah', label: 'שמחת תורה', order: 7 },
];

const SERVICES = {
  'kabbalat-shabbat': { label: 'קבלת שבת', order: 1 },
  maariv: { label: 'ערבית', order: 2 },
  shacharit: { label: 'שחרית', order: 3 },
  musaf: { label: 'מוסף', order: 4 },
  mincha: { label: 'מנחה', order: 5 },
  additional: { label: 'תפילות נוספות', order: 6 },
};

const DIRECT_CONTEXTS = {
  'Weekday Shacharit': [{ occasion: { slug: 'weekday', label: 'ימות החול', order: 1 }, service: 'shacharit' }],
  'Weekday Mincha': [{ occasion: { slug: 'weekday', label: 'ימות החול', order: 1 }, service: 'mincha' }],
  'Weekday Maariv': [{ occasion: { slug: 'weekday', label: 'ימות החול', order: 1 }, service: 'maariv' }],
  'Kabbalat Shabbat': [{ occasion: { slug: 'shabbat', label: 'שבת', order: 2 }, service: 'kabbalat-shabbat' }],
  'Shabbat Eve Maariv': [{ occasion: { slug: 'shabbat', label: 'שבת', order: 2 }, service: 'maariv' }],
  'Shabbat Morning Services': [{ occasion: { slug: 'shabbat', label: 'שבת', order: 2 }, service: 'shacharit' }],
  Musaf: [{ occasion: { slug: 'shabbat', label: 'שבת', order: 2 }, service: 'musaf' }],
  'Shabbat Mincha': [{ occasion: { slug: 'shabbat', label: 'שבת', order: 2 }, service: 'mincha' }],
};

const FESTIVAL_ROOTS = {
  'Pesach Haggadah': 'pesach',
  Nissan: 'pesach',
  Sukkot: 'sukkot',
  'Shaking Lulav': 'sukkot',
  'Simchat Torah': 'simchat-torah',
  Shavuot: 'shavuot',
};

function festivalContexts(service, sectionOrder, slugs = FESTIVALS.map(item => item.slug)) {
  return FESTIVALS
    .filter(occasion => slugs.includes(occasion.slug))
    .map(occasion => ({ occasion, service, sectionOrder }));
}

export function contextsForSiddurPath(path) {
  const root = path[0]?.en;
  const leaf = path.at(-1)?.en || '';
  if (!root) return [];
  const contexts = [...(DIRECT_CONTEXTS[root] || [])];

  if (root === 'Weekday Shacharit') {
    const commonShacharitOrder = new Map([
      ['Morning Blessings', 10],
      ['Blessings on Torah', 20],
      ['Morning Prayer', 30],
      ['Korbanot', 40],
      ["B'raita d'Rabi Yishmael", 50],
      ['Ashrei', 150],
    ]);
    if (commonShacharitOrder.has(leaf)) {
      contexts.push(...festivalContexts('shacharit', commonShacharitOrder.get(leaf)));
    }
    if (leaf === 'Aleinu') {
      contexts.push(
        ...festivalContexts('maariv', 90),
        ...festivalContexts('musaf', 90),
        ...festivalContexts('mincha', 90)
      );
    }
  }

  if (root === 'Weekday Mincha' && leaf === 'Korbanot') {
    contexts.push(...festivalContexts('mincha', 10));
  }

  if (root === 'Shabbat Eve Maariv' && leaf === 'Shema & Blessings') {
    contexts.push(...festivalContexts('maariv', 10));
  }

  if (root === 'Rosh Chodesh' && leaf === 'Hallel') {
    contexts.push(...festivalContexts('shacharit', 100));
  }

  if (root === 'Shabbat Morning Services') {
    const commonTorahOrder = new Map([
      ["Pesukei D'Zimrah", 60],
      ['Shema & Blessings', 70],
      ['Blessings on Torah Reading', 110],
      ['Hagbahah', 120],
      ['Haftarah Blessings', 130],
    ]);
    if (commonTorahOrder.has(leaf)) {
      contexts.push(...festivalContexts('shacharit', commonTorahOrder.get(leaf)));
    }
  }

  if (root === 'Holidays') {
    if (/Maariv, Shacharit.*Mincha Amidah/i.test(leaf)) {
      contexts.push(
        ...festivalContexts('maariv', 30),
        ...festivalContexts('shacharit', 90),
        ...festivalContexts('mincha', 20)
      );
      return contexts;
    }
    if (leaf === 'Kaddish Before Maariv Amidah') return [...contexts, ...festivalContexts('maariv', 20)];
    if (leaf === 'Yom Tov Musaf Amidah') return [...contexts, ...festivalContexts('musaf', 20)];
    if (leaf === 'Prayer for Dew') return [...contexts, ...festivalContexts('musaf', 30, ['pesach'])];
    if (leaf === 'Prayer for Rain') {
      return [...contexts, ...festivalContexts('musaf', 30, ['shemini-atzeret'])];
    }
    if (leaf === 'Yizkor') {
      return [
        ...contexts,
        ...festivalContexts('shacharit', 140, ['pesach', 'shavuot', 'shemini-atzeret']),
      ];
    }
    if (leaf === 'Prayer Upon Entering Sukkah') {
      return [...contexts, ...festivalContexts('additional', 20, ['sukkot'])];
    }
    if (leaf === 'Yom Tov Eve Kiddush' || leaf === 'Yom Tov Daytime Kiddush') {
      return [...contexts, ...festivalContexts('additional', 10)];
    }
    return contexts;
  }

  const festivalSlug = FESTIVAL_ROOTS[root];
  if (!festivalSlug) return contexts;
  const occasion = FESTIVALS.find(item => item.slug === festivalSlug);
  return [...contexts, { occasion, service: 'additional' }];
}

export function describeContext(context) {
  const described = {
    occasionSlug: context.occasion.slug,
    occasionLabel: context.occasion.label,
    occasionOrder: context.occasion.order,
    serviceSlug: context.service,
    serviceLabel: SERVICES[context.service].label,
    serviceOrder: SERVICES[context.service].order,
  };
  if (context.sectionOrder != null) described.sectionOrder = context.sectionOrder;
  return described;
}

export function flattenHebrewText(value, address = []) {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => flattenHebrewText(child, [...address, index + 1]));
  }
  if (typeof value !== 'string') return [];
  const text = value
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&#39;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  return text ? [{ text, address }] : [];
}

export const REUSABLE_LICENSES = new Set(['Public Domain', 'CC-BY', 'CC0']);