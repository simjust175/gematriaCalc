import { Search } from 'lucide-react';
import { useState } from 'react';
import './_group.css';

const filters = [
  ['all', 'הכול', '13,273'],
  ['word', 'מילה שלמה', '47'],
  ['phrase', 'צירוף שלם', '640'],
  ['partial', 'חלק ממילה', '12,586'],
];

export function Current() {
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

      <div className="current-controls" role="toolbar" aria-label="סינון התאמות">
        <label className="current-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" placeholder="חפש בתוצאות — מילה, פסוק או מראה מקום..." aria-label="חפש בתוצאות" />
        </label>
        <button type="button" className={`current-parshah ${activeParshah ? 'is-active' : ''}`} onClick={() => setActiveParshah(!activeParshah)}>
          פרשת השבוע <span>ואתחנן</span>
        </button>
        <div className="current-filter-list" role="group" aria-label="סוג התאמה">
          {filters.map(([value, label, count]) => (
            <button key={value} type="button" className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>
              {label}<span>{count}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}