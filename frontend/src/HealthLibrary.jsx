import React, { useMemo, useState } from 'react';
import { Icon, ResearchDotChart } from './viz.jsx';
import TelemetryBiomarkerHub from './TelemetryBiomarkerHub.jsx';
import { formatValue } from './api.js';
import './healthLibrary.css';

const NASA_RISKS = 'https://www.nasa.gov/humans-in-space/hhc-spaceflight-risks/';
const NASA_EVIDENCE = 'https://humanresearchroadmap.nasa.gov/Evidence/';
const NASA_OSD = 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575';

const TOPICS = [
  {
    id: 'cardio', number: '01', icon: 'heart', category: 'BODY SYSTEMS',
    title: 'Heart health', short: 'How your heart adjusts to space.',
    lead: 'In space, body fluids shift toward the head. The heart and blood vessels adjust.',
    why: 'Heart rate and blood pressure can change in space. One reading cannot tell us if something is wrong.',
    practice: 'Follow your exercise plan. Note what you were doing when a reading was taken.',
    source: NASA_RISKS, sourceLabel: 'NASA: Heart health'
  },
  {
    id: 'muscle', number: '02', icon: 'activity', category: 'BODY SYSTEMS',
    title: 'Muscle & bone health', short: 'Why exercise matters in space.',
    lead: 'Without gravity, muscles and bones can weaken over time.',
    why: 'Exercise and nutrition help protect strength and bone health.',
    practice: 'Follow your exercise plan. Report pain or unusual difficulty.',
    source: NASA_RISKS, sourceLabel: 'NASA: Muscle and bone health'
  },
  {
    id: 'vision', number: '03', icon: 'search', category: 'SPACEFLIGHT RISKS',
    title: 'Eyes & vision', short: 'How spaceflight can affect your eyes.',
    lead: 'Fluid shifts in space can affect the eyes. NASA studies this as SANS.',
    why: 'Vision changes need eye tests. Heart rate and oxygen readings cannot detect SANS.',
    practice: 'Follow scheduled eye checks. Report changes in vision.',
    source: 'https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/',
    sourceLabel: 'NASA: SANS overview'
  },
  {
    id: 'sleep', number: '04', icon: 'clock', category: 'CREW WELLNESS',
    title: 'Sleep & rest', short: 'Why sleep matters in space.',
    lead: 'Light, work and mission schedules can make sleep harder in space.',
    why: 'Poor sleep can affect health and focus. A single sensor cannot diagnose fatigue.',
    practice: 'Follow your sleep schedule. Report ongoing tiredness.',
    source: NASA_EVIDENCE, sourceLabel: 'NASA: Health research'
  },
  {
    id: 'nutrition', number: '05', icon: 'shield', category: 'CREW WELLNESS',
    title: 'Food & immunity', short: 'Why food and water matter in space.',
    lead: 'Good food and hydration support health on long missions. Spaceflight may also affect immunity.',
    why: 'Blood tests can show changes, but a doctor must interpret the results.',
    practice: 'Follow your food and water plan. Keep logs when required.',
    source: NASA_RISKS, sourceLabel: 'NASA: Spaceflight health risks'
  },
  {
    id: 'vitals', number: '06', icon: 'pulse', category: 'HEALTHGUARD GUIDE',
    title: 'Your vital signs', short: 'What the nine dashboard readings mean.',
    lead: 'HealthGuard shows five simulated vital signs and four extra simulated estimates.',
    why: 'Main readings: heart rate, blood oxygen (SpO₂), breathing rate, body temperature and heart rate variability (HRV). Extra estimates: two blood pressure values, exhaled CO₂ and skin temperature.',
    practice: 'Consider activity and recent readings, not just one number. The four extra estimates are not used by the main detector.',
    source: NASA_EVIDENCE, sourceLabel: 'NASA: Health research'
  }
];

function Tag({ children, tone = 'default' }) {
  return <span className={'tag tag-' + tone}>{children}</span>;
}

function SectionHeading({ count, overline, title, description, aside }) {
  return <div className="hl-section-heading">
    <div><p className="hl-kicker"><span>{count}</span> / {overline}</p><h2>{title}</h2><p>{description}</p></div>
    {aside}
  </div>;
}

export default function HealthLibrary({
  overview, method, liveAPDRA, liveCrew, selectedCrew, setSelectedCrew, assay, setAssay,
  biomarker, setBiomarker, biomarkers = [], measurements, reviews, loading, error
}) {
  const [activeTopic, setActiveTopic] = useState('cardio');
  const [topicQuery, setTopicQuery] = useState('');
  const [biomarkerQuery, setBiomarkerQuery] = useState('');
  const [detailView, setDetailView] = useState(false);

  const filteredTopics = useMemo(() => TOPICS.filter(topic =>
    [topic.title, topic.short, topic.category].some(value =>
      value.toLowerCase().includes(topicQuery.trim().toLowerCase())
    )), [topicQuery]);
  const currentTopic = TOPICS.find(topic => topic.id === activeTopic) || TOPICS[0];
  const filteredBiomarkers = useMemo(() => biomarkers.filter(b =>
    b.name.toLowerCase().includes(biomarkerQuery.trim().toLowerCase())
  ), [biomarkers, biomarkerQuery]);
  const selectedMeta = biomarkers.find(b => b.name === biomarker);
  const rows = measurements?.rows || [];
  const reviewRows = reviews?.rows || [];
  const before = rows.filter(row => row.phase === 'preflight').length;
  const after = rows.filter(row => row.phase === 'postflight').length;
  const percent = Number(method?.headline_exploratory_observation?.percent);
  const displayPercent = Number.isFinite(percent) ? percent.toFixed(2) : '34.87';

  return <div className="page-content hl-page" id="health-library">
    <section className="hl-hero" aria-labelledby="hl-title">
      <div className="hl-hero-copy">
        <p className="hl-kicker">CREW HEALTH GUIDE</p>
        <h1 id="hl-title">Health Library<span>.</span></h1>
        <p>Health in space and explore real NASA research.</p>
        <div className="hl-hero-actions">
          <a className="hl-button hl-button-primary" href="#hl-topics"><Icon name="book" size={17}/> Learn about space health <Icon name="arrow" size={15}/></a>
          <a className="hl-button hl-button-secondary" href="#hl-apdra">See APDRA results <Icon name="arrow" size={15}/></a>
        </div>
      </div>
      <div className="hl-hero-aside" aria-label="Library contents">
        <div className="hl-orbit-art" aria-hidden="true"><div className="hl-orbit-ring hl-orbit-ring-a"/><div className="hl-orbit-ring hl-orbit-ring-b"/><Icon name="heart" size={40}/></div>
        <div className="hl-hero-metrics"><div><strong>06</strong><span>HEALTH TOPICS</span></div><div><strong>09</strong><span>VITAL READINGS</span></div><div><strong>NASA</strong><span>LAB DATA</span></div></div>
      </div>
    </section>

    {error && <div className="hl-error" role="status"><Icon name="alert" size={17}/>{error}</div>}

    <section id="hl-topics" className="hl-section">
      <SectionHeading count="01" overline="ASTRONAUT HEALTH" title="Health in space" description="Choose a topic to learn more." />
      <div className="hl-topic-search"><Icon name="search" size={18}/><input value={topicQuery} onChange={event => setTopicQuery(event.target.value)} placeholder="Search health topics..." aria-label="Search health library topics"/>{topicQuery && <button type="button" onClick={() => setTopicQuery('')} aria-label="Clear topic search"><Icon name="x" size={16}/></button>}</div>
      <div className="hl-topic-grid">
        {filteredTopics.map(topic => <button type="button" key={topic.id} onClick={() => setActiveTopic(topic.id)} aria-pressed={activeTopic === topic.id} className={'hl-topic-card' + (activeTopic === topic.id ? ' hl-topic-active' : '')}>
          <div className="hl-topic-card-top"><span className="hl-topic-icon"><Icon name={topic.icon} size={21}/></span><span className="hl-topic-number">{topic.number}</span></div>
          <span className="hl-topic-category">{topic.category}</span>
          <strong>{topic.title}</strong>
          <p>{topic.short}</p>
          <span className="hl-topic-open">Read topic <Icon name="arrow" size={15}/></span>
        </button>)}
        {!filteredTopics.length && <p className="hl-no-results">No results. Try another word.</p>}
      </div>
      <article className="hl-feature-article" aria-live="polite">
        <div className="hl-article-heading"><div><span className="hl-kicker">HEALTH GUIDE / {currentTopic.category}</span><h3>{currentTopic.title}</h3></div><span className="hl-article-icon"><Icon name={currentTopic.icon} size={26}/></span></div>
        <p className="hl-article-lead">{currentTopic.lead}</p>
        <div className="hl-article-columns">
          <div><span>WHAT TO KNOW</span><p>{currentTopic.why}</p></div>
          <div><span>WHAT TO DO</span><p>{currentTopic.practice}</p></div>
        </div>
        <div className="hl-article-bottom"><span><Icon name="shield" size={16}/> For learning only. Follow crew medical guidance.</span><a href={currentTopic.source} target="_blank" rel="noreferrer">{currentTopic.sourceLabel} <Icon name="external" size={14}/></a></div>
      </article>
    </section>

    <section className="hl-section" id="hl-apdra">
      <SectionHeading count="02" overline="RESEARCH METHOD" title="APDRA: Can we trust this flag?" description="APDRA checks if a lab result still looks unusual when one earlier sample is removed." aside={<Tag tone="cyan">FROZEN v0.7</Tag>}/>
      <div className="hl-live-apdra">
        <div className="hl-live-apdra-top"><div><p className="hl-kicker">LIVE SIMULATOR / APDRA ADAPTATION</p><h3>Current crew baseline</h3><p>Five simulated vital signs · {liveCrew || 'No crew selected'}</p></div><Tag tone="cyan">EXPERIMENTAL</Tag></div>
        <div className="hl-live-apdra-content">
          <div><span>Baseline check</span><strong>{liveAPDRA?.status ? liveAPDRA.status.replaceAll('_',' ') : 'Awaiting simulated data'}</strong></div>
          <div><span>Baseline samples</span><strong>{liveAPDRA?.reference_points ?? 0}/45</strong></div>
          <div><span>Steady changes</span><strong>{liveAPDRA?.stable_channels?.length ?? 0}</strong></div>
        </div>
        {liveAPDRA?.stable_channels?.length > 0 && <p>Changed signals: {liveAPDRA.stable_channels.map(key => key.replaceAll('_',' ')).join(', ')}.</p>}
        <p>Uses 15-sample blocks and checks each astronaut's own baseline. This live adaptation is not clinically validated. It can request a simulated CHECK after repeated changes, but cannot trigger a WARNING or CRITICAL on its own.</p>
      </div>
      <div className="hl-apdra-layout">
        <div className="hl-apdra-explainer">
          <div className="hl-apdra-heading"><div className="hl-apdra-symbol"><Icon name="flask" size={23}/></div><div><strong>Checking a personal baseline</strong><p>A baseline is your usual reading before flight.</p></div></div>
          <div className="hl-step-track">
            <div className="hl-step"><span>01</span><div><strong>Use preflight readings</strong><p>Use the astronaut's own lab results from before flight.</p></div></div>
            <div className="hl-step"><span>02</span><div><strong>Remove one reading</strong><p>Remove each preflight sample, one at a time. Check if the unusual-result flag stays the same.</p></div></div>
            <div className="hl-step"><span>03</span><div><strong>Review changed flags</strong><p>If the flag changes, mark it for review.</p></div></div>
          </div>
          <div className="hl-apdra-boundary"><Icon name="alert" size={18}/><span>Original APDRA v0.7 analyzes NASA lab data only. The new live adaptation above uses separate simulated data. Neither version diagnoses illness or has proven clinical accuracy.</span></div>
        </div>
        <div className="hl-apdra-findings">
          <p className="hl-kicker">NASA DATA / APDRA RESULT</p>
          <strong className="hl-apdra-percent">{displayPercent}<span>%</span></strong>
          <p className="hl-apdra-caption">of the original flags changed when one preflight reading was removed.</p>
          <div className="hl-apdra-denominator"><div><strong>68</strong><span>flags that changed</span></div><div><strong>195</strong><span>original flagged results</span></div></div>
          <p className="hl-apdra-note">Based on four astronauts. Changed flags are not proven mistakes or diagnoses.</p>
        </div>
      </div>
    </section>

    <section id="hl-nasa" className="hl-section">
      <SectionHeading count="03" overline="NASA OPEN SCIENCE" title="NASA lab results" description="View lab results collected before and after flight." aside={<Tag tone="blue">HISTORICAL DATA</Tag>}/>
      <div className="hl-dataset-banner">
        <div><span className="hl-kicker">NASA RESEARCH</span><h3>Inspiration4 <span>/</span> OSD-575</h3><p>Lab results from four Inspiration4 astronauts.</p><a href={overview?.study_url || NASA_OSD} target="_blank" rel="noreferrer">View NASA source <Icon name="external" size={14}/></a></div>
        <div className="hl-dataset-stats"><div><strong>{overview?.observations?.toLocaleString() ?? '—'}</strong><span>LAB RESULTS</span></div><div><strong>{overview?.astronauts ?? '—'}</strong><span>PARTICIPANTS</span></div><div><strong>{Object.keys(overview?.assays || {}).length || '—'}</strong><span>TEST TYPES</span></div></div>
      </div>
      <div className="hl-explorer-panel">
        <div className="hl-panel-title"><div><p className="hl-kicker">EXPLORE RESULTS</p><h3>Choose a lab test</h3></div><span className="hl-quiet-label">ORIGINAL DATA</span></div>
        <div className="hl-filter-grid">
          <label>PARTICIPANT
            <select value={selectedCrew} onChange={event => setSelectedCrew(event.target.value)}>{(overview?.subject_ids || ['C001','C002','C003','C004']).map(id => <option key={id} value={id}>{id}</option>)}</select>
          </label>
          <label>ASSAY
            <select value={assay} onChange={event => { setAssay(event.target.value); setBiomarker(''); setBiomarkerQuery(''); }}><option value="CMP">Metabolic panel (CMP)</option><option value="NULISA">Protein panel (NULISA)</option></select>
          </label>
          <label>MEASUREMENT
            <select value={biomarker} disabled={!biomarkers.length} onChange={event => setBiomarker(event.target.value)}>
              <option value="" disabled>Choose a test</option>
              {filteredBiomarkers.map(item => <option key={item.assay + ':' + item.name} value={item.name}>{item.name} ({item.unit})</option>)}
              {biomarker && !filteredBiomarkers.some(item => item.name === biomarker) && <option value={biomarker}>{biomarker}</option>}
            </select>
          </label>
          <label>SEARCH TESTS
            <div className="hl-input-with-icon"><Icon name="search" size={17}/><input value={biomarkerQuery} onChange={event => setBiomarkerQuery(event.target.value)} placeholder="Search tests..." aria-label="Search lab tests"/>{biomarkerQuery && <button type="button" onClick={() => setBiomarkerQuery('')} aria-label="Clear biomarker search"><Icon name="x" size={14}/></button>}</div>
          </label>
        </div>
        {!filteredBiomarkers.length && biomarkerQuery && <p className="hl-filter-empty">No tests match “{biomarkerQuery}”.</p>}
      </div>
      <div className="hl-measurement-layout">
        <div className="hl-chart-card">
          <div className="hl-panel-title"><div><p className="hl-kicker">LAB RESULTS</p><h3>{biomarker || 'Choose a test'} <span>{selectedMeta?.unit ? '· ' + selectedMeta.unit : ''}</span></h3></div><span className="hl-quiet-label">{measurements?.total ?? '—'} DRAWS</span></div>
          {loading ? <div className="hl-loading"><Icon name="radio" size={17}/> Loading NASA data...</div> : <ResearchDotChart rows={rows} unit={selectedMeta?.unit || ''}/>}
          <div className="hl-chart-caption"><Icon name="database" size={16}/> These are separate lab samples, not live readings. No values were filled in.</div>
        </div>
        <aside className="hl-reading-card">
          <p className="hl-kicker">GRAPH GUIDE</p><h3>What you're seeing</h3>
          <div className="hl-reading-row"><span>Before flight</span><strong>{before}</strong></div>
          <div className="hl-reading-row"><span>After flight</span><strong>{after}</strong></div>
          <div className="hl-reading-row"><span>Test type</span><strong>{assay}</strong></div>
          <div className="hl-reading-row"><span>Unit</span><strong>{selectedMeta?.unit || '—'}</strong></div>
          <p>Blue dots show results before flight. Orange dots show results after flight. A change does not prove illness or recovery.</p>
          <div className="hl-legend"><span><i className="hl-dot-cyan"/>Preflight</span><span><i className="hl-dot-amber"/>Postflight</span></div>
        </aside>
      </div>
      <div className="hl-bottom-grid">
        <div className="hl-review-card">
          <div className="hl-panel-title"><div><p className="hl-kicker">HISTORICAL EVIDENCE</p><h3>Results to review <span>({reviews?.total ?? 0})</span></h3></div><Tag tone="amber">NOT DIAGNOSES</Tag></div>
          {reviewRows.length ? <div className="hl-review-list">{reviewRows.slice(0,8).map((row,index) => <div className="hl-review-item" key={row.biomarker + row.timepoint + index}>
            <span className="hl-review-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{row.biomarker} · {row.timepoint}</strong><small>{row.screening_stability} · Preflight reference n={row.baseline_n ?? '—'}</small><p>{row.reason}</p></div>
            <span className="hl-review-status">{row.review_category || 'Review'}</span>
          </div>)}</div> : <div className="hl-empty-review"><Icon name="check" size={20}/><strong>Nothing flagged for review</strong><p>This does not guarantee good health. Try another astronaut or test.</p></div>}
        </div>
        <div className="hl-method-card"><p className="hl-kicker">ABOUT THESE RESULTS</p><h3>What these results mean</h3><p>APDRA shows which flags need another look. It cannot tell if an astronaut is sick.</p><a href="#hl-apdra">How APDRA works <Icon name="arrow" size={15}/></a><a href="https://doi.org/10.26030/mc5d-p710" target="_blank" rel="noreferrer">Study reference <Icon name="external" size={14}/></a></div>
      </div>
      <details className="hl-records">
        <summary><span><Icon name="database" size={19}/><strong>Show original NASA lab records</strong><small>{rows.length} displayed / {measurements?.total ?? 0} available</small></span><Icon name="chevron" size={18}/></summary>
        <div className="hl-records-body">
          <button type="button" onClick={() => setDetailView(value => !value)} className="hl-detail-toggle">{detailView ? 'Hide details' : 'Show details'}</button>
          <div className="hl-table-scroll"><table><thead><tr><th>TIMEPOINT</th><th>PHASE</th><th>VALUE</th><th>UNIT</th><th>SAMPLE ID</th>{detailView && <th>SOURCE / NOTES</th>}</tr></thead><tbody>
            {rows.length ? rows.map((row,index) => <tr key={row.sample_id + ':' + index}><td>{row.timepoint}</td><td><Tag tone={row.phase === 'preflight' ? 'cyan' : 'amber'}>{row.phase?.toUpperCase()}</Tag></td><td className="hl-record-value">{formatValue(row.value,3)}</td><td>{row.unit || '—'}</td><td className="hl-monospace">{row.sample_id}</td>{detailView && <td>{row.source}<small>{row.qc_note}</small></td>}</tr>) : <tr><td colSpan={detailView ? 6 : 5}>No lab results found.</td></tr>}
          </tbody></table></div>
          <p>Original sample IDs are kept. Up to 200 records are shown per search. Missing values are not invented.</p>
        </div>
      </details>
      <TelemetryBiomarkerHub compact/>
      <div className="hl-source-boundary"><Icon name="shield" size={18}/><p><strong>Important:</strong> These NASA lab results are separate from HealthGuard's simulated live readings. APDRA is a research tool, not a medical diagnosis system.</p></div>
    </section>
  </div>;
}
