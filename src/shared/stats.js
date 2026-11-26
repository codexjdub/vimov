'use strict';

// "Your week with Vimov": links followed, distance scrolled and tabs
// switched with Vimov's keys this week. They're counted on this computer
// only, in storage.local as `stats` (src/background.js keeps them), and
// shown on the options page. Weeks start on Monday.

globalThis.Vimov = globalThis.Vimov || {};

(() => {
  const KINDS = ['links', 'px', 'tabs'];
  const pad = (n) => String(n).padStart(2, '0');

  // The Monday that starts the week of `date`, in local time, as YYYY-MM-DD.
  const weekOf = (date) => {
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
    return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
  };
  const weekBefore = (week) => {
    const [y, m, d] = week.split('-').map(Number);
    return weekOf(new Date(y, m - 1, d - 7));
  };
  // { links, px, tabs } from anything, each a count of zero or more.
  const totals = (from) => Object.fromEntries(KINDS.map((kind) => [kind, Math.max(0, Number(from?.[kind]) || 0)]));

  // The stats for the week of `now`: { week, links, px, tabs, last }, where
  // `last` is last week's totals, or null when last week wasn't counted.
  // Stored stats from an older week start the new one at zero.
  Vimov.statsFor = (stats, now) => {
    const week = weekOf(now);
    const zero = totals();
    if (stats?.week === week) return { week, ...totals(stats), last: stats.last ? totals(stats.last) : null };
    return { week, ...zero, last: stats?.week === weekBefore(week) ? totals(stats) : null };
  };

  // `stats` with `counts` (any of links, px and tabs) added for the week of `now`.
  Vimov.addTally = (stats, counts, now) => {
    const week = Vimov.statsFor(stats, now);
    const added = totals(counts);
    for (const kind of KINDS) week[kind] += added[kind];
    return week;
  };

  Vimov.weekOf = weekOf;

  // Pixels as a distance: a CSS pixel is 1/96 inch, 0.2646 mm.
  Vimov.pxToMeters = (px) => (px * 0.2646) / 1000;

  const number = (n, digits = 0) =>
    n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: digits });

  // "35 cm", "120 m", "1.25 km", "18.3 km".
  Vimov.formatDistance = (m) => {
    if (m < 1) return `${number(m * 100)} cm`;
    if (m < 1000) return `${number(m)} m`;
    return `${number(m / 1000, m < 10000 ? 2 : 1)} km`;
  };

  // Things to picture a distance by, longest first: [meters, one, several].
  const LANDMARKS = [
    [42195, 'a marathon', 'marathons'],
    [8849, 'the height of Mount Everest', 'Mount Everests'],
    [828, 'the height of the Burj Khalifa', 'Burj Khalifas'],
    [330, 'the height of the Eiffel Tower', 'Eiffel Towers'],
    [93, 'the height of the Statue of Liberty', 'Statues of Liberty'],
    [30, 'a blue whale, nose to tail', 'blue whales'],
  ];

  // "That's 2.4 Eiffel Towers." for a distance in meters; '' for one too
  // short to picture.
  Vimov.distanceLike = (m) => {
    const landmark = LANDMARKS.find(([size]) => m >= size * 0.95);
    if (!landmark) return '';
    const [size, one, several] = landmark;
    const times = m / size;
    if (times < 1.1) return `That’s ${one}.`;
    return `That’s ${number(times, times < 10 ? 1 : 0)} ${several}.`;
  };
})();
