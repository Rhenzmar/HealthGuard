import React, { useMemo, useState } from 'react';
import { Icon, ResearchDotChart } from './viz.jsx';
import { formatValue } from './api.js';
import './healthLibrary.css';

const NASA_RISKS = 'https://www.nasa.gov/humans-in-space/hhc-spaceflight-risks/';
const NASA_EVIDENCE = 'https://humanresearchroadmap.nasa.gov/Evidence/';
const NASA_OSD = 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575';

const TOPICS = [
  {
    id: 'cardio', number: '01', icon: 'heart', category: 'BODY SYSTEMS',
    title: 'Heart & circulation', short: 'How blood flow and cardiovascular regulation adapt in microgravity.',
    lead: 'In microgravity, fluids redistribute toward the upper body and the cardiovascular system adapts to a different workload.',
    why: 'Heart rate, blood pressure and changes relative to an individual baseline can provide useful context, but a single reading cannot determine cardiovascular health.',
    practice: 'Follow the mission exercise and measurement schedule. Record activity and posture when checking vital signs so changes can be interpreted in context.',
    source: NASA_RISKS, sourceLabel: 'NASA: Cardiovascular and fitness risks'
  },
  {
    id: 'muscle', number: '02', icon: 'activity', category: 'BODY SYSTEMS',
    title: 'Muscle & bone health', short: 'Why movement and resistance exercise matter during long missions.',
    lead: 'When muscles and weight-bearing bones work less against gravity, strength and bone density can decrease over time.',
    why: 'Strength, movement, nutrition and exercise records provide a fuller picture than a single numerical vital sign.',
    practice: 'Use crew-approved exercise plans and document completed sessions, discomfort or unexpected difficulty for medical review.',
    source: NASA_RISKS, sourceLabel: 'NASA: Musculoskeletal fitness'
  },
  {
    id: 'vision', number: '03', icon: 'search', category: 'SPACEFLIGHT RISKS',
    title: 'Vision & fluid shifts', short: 'Understand Spaceflight Associated Neuro-ocular Syndrome (SANS).',
    lead: 'Headward fluid shifts and other spaceflight-related changes may affect the eyes and vision. SANS remains an active research topic.',
    why: 'Visual symptoms need their own dedicated assessments. Heart rate or oxygen readings alone cannot identify SANS.',
    practice: 'Follow established eye-check procedures and report new visual changes according to mission medical protocols.',
    source: 'https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/',
    sourceLabel: 'NASA: SANS overview'
  },
  {
    id: 'sleep', number: '04', icon: 'clock', category: 'CREW WELLNESS',
    title: 'Sleep & circadian rhythm', short: 'Understand fatigue, rest schedules and performance in space.',
    lead: 'Unusual light cycles, workload and mission schedules can interfere with sleep timing and quality.',
    why: 'Sleep and activity context matter when interpreting physiological changes. Fatigue cannot be diagnosed from one sensor channel.',
    practice: 'Maintain the assigned sleep schedule and log sleep quality or persistent fatigue for the crew health team.',
    source: NASA_EVIDENCE, sourceLabel: 'NASA: Human Research Program evidence'
  },
  {
    id: 'nutrition', number: '05', icon: 'shield', category: 'CREW WELLNESS',
    title: 'Nutrition & immune health', short: 'Why food intake, hydration and immune changes are studied.',
    lead: 'Nutrition, stress and altered immune responses are important considerations during long-duration missions.',
    why: 'Blood biomarkers offer research information, but they require appropriate reference ranges, sampling context and medical interpretation.',
    practice: 'Keep routine food and fluid logs if required by the mission plan. Do not treat a single laboratory change as a diagnosis.',
    source: NASA_RISKS, sourceLabel: 'NASA: Spaceflight health risks'
  },
  {
    id: 'vitals', number: '06', icon: 'pulse', category: 'HEALTHGUARD GUIDE',
    title: 'Understanding your vitals', short: 'A guide to the nine values shown in Crew Telemetry.',
    lead: 'HealthGuard currently displays five main simulated physiological channels and four additional simulated estimates.',
    why: 'Main channels: heart rate, SpO₂, respiratory rate, core temperature and HRV (RMSSD). Additional estimates: systolic pressure, diastolic pressure, end-tidal CO₂ and peripheral temperature.',
    practice: 'Compare readings with personal context, activity and measurement quality. The four additional estimates are not inputs to the frozen five-channel detector.',
    source: NASA_EVIDENCE, sourceLabel: 'NASA: Human Research Program evidence'
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
  overview, method, selectedCrew, setSelectedCrew, assay, setAssay,
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
        <p className="hl-kicker">HEALTHGUARD / CREW HEALTH REFERENCE</p>
        <h1 id="hl-title">Health Library<span>.</span></h1>
        <p>Explore what spaceflight does to the human body, understand your monitoring signals, and investigate real NASA research evidence.</p>
        <div className="hl-hero-actions">
          <a className="hl-button hl-button-primary" href="#hl-topics"><Icon name="book" size={17}/> Explore health topics <Icon name="arrow" size={15}/></a>
          <a className="hl-button hl-button-secondary" href="#hl-apdra">Explore APDRA research <Icon name="arrow" size={15}/></a>
        </div>
      </div>
      <div className="hl-hero-aside" aria-label="Library contents">
        <div className="hl-orbit-art" aria-hidden="true"><div className="hl-orbit-ring hl-orbit-ring-a"/><div className="hl-orbit-ring hl-orbit-ring-b"/><Icon name="heart" size={40}/></div>
        <div className="hl-hero-metrics"><div><strong>06</strong><span>LEARNING TOPICS</span></div><div><strong>09</strong><span>DISPLAYED VITALS</span></div><div><strong>NASA</strong><span>RESEARCH RECORDS</span></div></div>
      </div>
    </section>

    {error && <div className="hl-error" role="status"><Icon name="alert" size={17}/>{error}</div>}

    <section id="hl-topics" className="hl-section">
      <SectionHeading count="01" overline="ASTRONAUT HEALTH" title="Learn about health in space" description="Practical, readable explanations grounded in NASA's space-health research." />
      <div className="hl-topic-search"><Icon name="search" size={18}/><input value={topicQuery} onChange={event => setTopicQuery(event.target.value)} placeholder="Search topics: heart, sleep, vision, vitals..." aria-label="Search health library topics"/>{topicQuery && <button type="button" onClick={() => setTopicQuery('')} aria-label="Clear topic search"><Icon name="x" size={16}/></button>}</div>
      <div className="hl-topic-grid">
        {filteredTopics.map(topic => <button type="button" key={topic.id} onClick={() => setActiveTopic(topic.id)} aria-pressed={activeTopic === topic.id} className={'hl-topic-card' + (activeTopic === topic.id ? ' hl-topic-active' : '')}>
          <div className="hl-topic-card-top"><span className="hl-topic-icon"><Icon name={topic.icon} size={21}/></span><span className="hl-topic-number">{topic.number}</span></div>
          <span className="hl-topic-category">{topic.category}</span>
          <strong>{topic.title}</strong>
          <p>{topic.short}</p>
          <span className="hl-topic-open">Read topic <Icon name="arrow" size={15}/></span>
        </button>)}
        {!filteredTopics.length && <p className="hl-no-results">No topics match this search. Try “sleep”, “vision”, or “vitals”.</p>}
      </div>
      <article className="hl-feature-article" aria-live="polite">
        <div className="hl-article-heading"><div><span className="hl-kicker">FIELD GUIDE / {currentTopic.category}</span><h3>{currentTopic.title}</h3></div><span className="hl-article-icon"><Icon name={currentTopic.icon} size={26}/></span></div>
        <p className="hl-article-lead">{currentTopic.lead}</p>
        <div className="hl-article-columns">
          <div><span>WHY IT MATTERS</span><p>{currentTopic.why}</p></div>
          <div><span>CREW REFERENCE</span><p>{currentTopic.practice}</p></div>
        </div>
        <div className="hl-article-bottom"><span><Icon name="shield" size={16}/> Education, not a medical instruction or diagnosis</span><a href={currentTopic.source} target="_blank" rel="noreferrer">{currentTopic.sourceLabel} <Icon name="external" size={14}/></a></div>
      </article>
    </section>

    <section className="hl-section" id="hl-apdra">
      <SectionHeading count="02" overline="RESEARCH METHOD" title="APDRA: checking baseline stability" description="See how HealthGuard's retrospective research method questions a screening flag before accepting it as stable." aside={<Tag tone="cyan">FROZEN v0.7</Tag>}/>
      <div className="hl-apdra-layout">
        <div className="hl-apdra-explainer">
          <div className="hl-apdra-heading"><div className="hl-apdra-symbol"><Icon name="flask" size={23}/></div><div><strong>One change. Multiple reference checks.</strong><p>A personalized research screening method for sparse preflight laboratory samples.</p></div></div>
          <div className="hl-step-track">
            <div className="hl-step"><span>01</span><div><strong>Establish personal reference</strong><p>Start with the participant's observed preflight laboratory samples, not a population-average value.</p></div></div>
            <div className="hl-step"><span>02</span><div><strong>Leave one reference sample out</strong><p>Re-check the screen after omitting each preflight sample in turn. See whether its direction and threshold interpretation remain consistent.</p></div></div>
            <div className="hl-step"><span>03</span><div><strong>Document stability for review</strong><p>Mark consistent or baseline-sensitive research screens, with source records and limitations available to inspect.</p></div></div>
          </div>
          <div className="hl-apdra-boundary"><Icon name="alert" size={18}/><span>APDRA here is applied to historical OSD-575 lab observations. It is <strong>not connected to live crew telemetry</strong>, does not diagnose disease, and has not demonstrated general accuracy superiority.</span></div>
        </div>
        <div className="hl-apdra-findings">
          <p className="hl-kicker">NASA OSD-575 / RETROSPECTIVE CROSSCHECK</p>
          <strong className="hl-apdra-percent">{displayPercent}<span>%</span></strong>
          <p className="hl-apdra-caption">of conventional median-only flagged observations changed classification in at least one leave-one-preflight-measurement-out check.</p>
          <div className="hl-apdra-denominator"><div><strong>68</strong><span>baseline-sensitive median flags</span></div><div><strong>195</strong><span>median-only flagged observations</span></div></div>
          <p className="hl-apdra-note">These are repeated measurements from four people, not 195 independent cases or 68 proven false positives.</p>
        </div>
      </div>
    </section>

    <section id="hl-nasa" className="hl-section">
      <SectionHeading count="03" overline="NASA OPEN SCIENCE" title="Explore real flight-related measurements" description="Inspect original Inspiration4 laboratory draws, independently of the fictional astronaut simulator." aside={<Tag tone="blue">SOURCE-LABELED DATA</Tag>}/>
      <div className="hl-dataset-banner">
        <div><span className="hl-kicker">NASA OPEN SCIENCE DATA REPOSITORY</span><h3>Inspiration4 <span>/</span> OSD-575</h3><p>Preflight and postflight laboratory measurements from four pseudonymous research participants.</p><a href={overview?.study_url || NASA_OSD} target="_blank" rel="noreferrer">Open original NASA study <Icon name="external" size={14}/></a></div>
        <div className="hl-dataset-stats"><div><strong>{overview?.observations?.toLocaleString() ?? '—'}</strong><span>OBSERVATIONS</span></div><div><strong>{overview?.astronauts ?? '—'}</strong><span>PARTICIPANTS</span></div><div><strong>{Object.keys(overview?.assays || {}).length || '—'}</strong><span>ASSAY TYPES</span></div></div>
      </div>
      <div className="hl-explorer-panel">
        <div className="hl-panel-title"><div><p className="hl-kicker">RESEARCH EXPLORER</p><h3>Find a laboratory measurement</h3></div><span className="hl-quiet-label">NO INTERPOLATION</span></div>
        <div className="hl-filter-grid">
          <label>PARTICIPANT
            <select value={selectedCrew} onChange={event => setSelectedCrew(event.target.value)}>{(overview?.subject_ids || ['C001','C002','C003','C004']).map(id => <option key={id} value={id}>{id}</option>)}</select>
          </label>
          <label>ASSAY
            <select value={assay} onChange={event => { setAssay(event.target.value); setBiomarker(''); setBiomarkerQuery(''); }}><option value="CMP">Metabolic panel (CMP)</option><option value="NULISA">Protein panel (NULISA)</option></select>
          </label>
          <label>MEASUREMENT
            <select value={biomarker} disabled={!biomarkers.length} onChange={event => setBiomarker(event.target.value)}>
              <option value="" disabled>Select a measurement</option>
              {filteredBiomarkers.map(item => <option key={item.assay + ':' + item.name} value={item.name}>{item.name} ({item.unit})</option>)}
              {biomarker && !filteredBiomarkers.some(item => item.name === biomarker) && <option value={biomarker}>{biomarker}</option>}
            </select>
          </label>
          <label>FILTER MEASUREMENTS
            <div className="hl-input-with-icon"><Icon name="search" size={17}/><input value={biomarkerQuery} onChange={event => setBiomarkerQuery(event.target.value)} placeholder="Type a biomarker name..." aria-label="Filter available lab measurements"/>{biomarkerQuery && <button type="button" onClick={() => setBiomarkerQuery('')} aria-label="Clear biomarker search"><Icon name="x" size={14}/></button>}</div>
          </label>
        </div>
        {!filteredBiomarkers.length && biomarkerQuery && <p className="hl-filter-empty">No available measurements match “{biomarkerQuery}”.</p>}
      </div>
      <div className="hl-measurement-layout">
        <div className="hl-chart-card">
          <div className="hl-panel-title"><div><p className="hl-kicker">ORIGINAL SAMPLE DRAWS</p><h3>{biomarker || 'Select a measurement'} <span>{selectedMeta?.unit ? '· ' + selectedMeta.unit : ''}</span></h3></div><span className="hl-quiet-label">{measurements?.total ?? '—'} DRAWS</span></div>
          {loading ? <div className="hl-loading"><Icon name="radio" size={17}/> Loading laboratory records...</div> : <ResearchDotChart rows={rows} unit={selectedMeta?.unit || ''}/>}
          <div className="hl-chart-caption"><Icon name="database" size={16}/> Samples were collected at discrete timepoints, not continuously. Values are not interpolated.</div>
        </div>
        <aside className="hl-reading-card">
          <p className="hl-kicker">HOW TO READ THIS GRAPH</p><h3>Measurement context</h3>
          <div className="hl-reading-row"><span>Preflight samples</span><strong>{before}</strong></div>
          <div className="hl-reading-row"><span>Postflight samples</span><strong>{after}</strong></div>
          <div className="hl-reading-row"><span>Selected assay</span><strong>{assay}</strong></div>
          <div className="hl-reading-row"><span>Unit</span><strong>{selectedMeta?.unit || '—'}</strong></div>
          <p>Cyan dots mark samples before flight, while amber dots mark samples after flight. Changes across draws are descriptive; they do not by themselves establish illness, recovery, or causality.</p>
          <div className="hl-legend"><span><i className="hl-dot-cyan"/>Preflight</span><span><i className="hl-dot-amber"/>Postflight</span></div>
        </aside>
      </div>
      <div className="hl-bottom-grid">
        <div className="hl-review-card">
          <div className="hl-panel-title"><div><p className="hl-kicker">HISTORICAL EVIDENCE</p><h3>APDRA review prompts <span>({reviews?.total ?? 0})</span></h3></div><Tag tone="amber">NOT DIAGNOSES</Tag></div>
          {reviewRows.length ? <div className="hl-review-list">{reviewRows.slice(0,8).map((row,index) => <div className="hl-review-item" key={row.biomarker + row.timepoint + index}>
            <span className="hl-review-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{row.biomarker} · {row.timepoint}</strong><small>{row.screening_stability} · Preflight reference n={row.baseline_n ?? '—'}</small><p>{row.reason}</p></div>
            <span className="hl-review-status">{row.review_category || 'Review'}</span>
          </div>)}</div> : <div className="hl-empty-review"><Icon name="check" size={20}/><strong>No review prompt for this selection</strong><p>This does not establish health normality. Try a different participant or biomarker.</p></div>}
        </div>
        <div className="hl-method-card"><p className="hl-kicker">WHAT APDRA CAN AND CANNOT TELL US</p><h3>Evidence, with limits.</h3><p>The review queue presents evidence-stability and measurement-verification prompts. No disease labels, independent medical outcome labels, or clinical recommendations are inferred from these samples.</p><a href="#hl-apdra">Review the APDRA method <Icon name="arrow" size={15}/></a><a href="https://doi.org/10.26030/mc5d-p710" target="_blank" rel="noreferrer">Research dataset DOI <Icon name="external" size={14}/></a></div>
      </div>
      <details className="hl-records">
        <summary><span><Icon name="database" size={19}/><strong>View underlying NASA measurement records</strong><small>{rows.length} displayed / {measurements?.total ?? 0} available</small></span><Icon name="chevron" size={18}/></summary>
        <div className="hl-records-body">
          <button type="button" onClick={() => setDetailView(value => !value)} className="hl-detail-toggle">{detailView ? 'Hide source details' : 'Show source details'}</button>
          <div className="hl-table-scroll"><table><thead><tr><th>TIMEPOINT</th><th>PHASE</th><th>VALUE</th><th>UNIT</th><th>SAMPLE ID</th>{detailView && <th>PROVENANCE / QC</th>}</tr></thead><tbody>
            {rows.length ? rows.map((row,index) => <tr key={row.sample_id + ':' + index}><td>{row.timepoint}</td><td><Tag tone={row.phase === 'preflight' ? 'cyan' : 'amber'}>{row.phase?.toUpperCase()}</Tag></td><td className="hl-record-value">{formatValue(row.value,3)}</td><td>{row.unit || '—'}</td><td className="hl-monospace">{row.sample_id}</td>{detailView && <td>{row.source}<small>{row.qc_note}</small></td>}</tr>) : <tr><td colSpan={detailView ? 6 : 5}>No laboratory records returned for this selection.</td></tr>}
          </tbody></table></div>
          <p>Original source labels and sample IDs are retained. The API limits a query to the first 200 rows. No imputation is performed.</p>
        </div>
      </details>
      <div className="hl-source-boundary"><Icon name="shield" size={18}/><p><strong>Source and system boundary:</strong> Historical NASA laboratory records are separate from all fictional crew telemetry and the CNN/covariance simulator. APDRA is a retrospective evidence-stability analysis, not a deployed medical diagnosis system.</p></div>
    </section>
  </div>;
}
