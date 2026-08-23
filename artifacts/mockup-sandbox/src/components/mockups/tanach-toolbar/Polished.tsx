import { BookOpenCheck, Search } from 'lucide-react';
import { useState } from 'react';
import './_group.css';

const filters = [
  ['all', 'הכול', '13,273'],
  ['word', 'מילה שלמה', '47'],
  ['phrase', 'צירוף שלם', '640'],
  ['partial', 'חלק ממילה', '12,586'],
];

export function Polished() {
  const [filter, setFilter] = useState('all');
  const [activeParshah, setActiveParshah] = useState(false);

  return (
    <section className="tanach-frame" dir="rtl">
      <header className="tanach-heading">
        <div>
          <span className="tanach-kicker">הדים מספריים בתנ״ך</span>
          <h2>איפה עוד מופיע הערך 26?</h2>
          <p>חיפוש ממוקד במאגר התנ״ך, לפי הסדר הקנוני — כדי לתת למספר הקשר.</p>
        </div>
        <div className="tanach-total"><strong>13,273</strong><span>התאמות</span></div>
      </header>

      <div className="polished-toolbar" role="toolbar" aria-label="סינון התאמות">
        <div className="polished-primary-row">
          <label className="polished-search">
            <Search aria-hidden="true" />
            <input type="search" placeholder="חפש בתוצאות — מילה, פסוק או מראה מקום..." aria-label="חפש בתוצאות" />
          </label>
          <button type="button" className={`polished-parshah ${activeParshah ? 'is-active' : ''}`} aria-pressed={activeParshah} onClick={() => setActiveParshah(!activeParshah)}>
            <BookOpenCheck aria-hidden="true" />
            <span className="polished-parshah-copy">
              <span className="polished-parshah-title">פרשת השבוע</span>
              <span className="polished-parshah-name">{activeParshah ? 'ואתחנן · 8 התאמות' : 'ואתחנן'}</span>
            </span>
          </button>
        </div>
        <div className="polished-filter-list" role="group" aria-label="סוג התאמה">
          {filters.map(([value, label, count]) => (
            <button key={value} type="button" className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>
              {label}<span>{count}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="polished-note">פרשת השבוע: <strong>ואתחנן</strong>{activeParshah && <> · 8 התאמות</>}</p>
    </section>
  );
}