"""PHYSIOGRAPH v0.9 | NASA-inspired research-to-monitoring prototype.

This is exploratory software for examining biomarker measurement stability,
not a clinical decision system or NASA-certified astronaut health monitor.
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import streamlit as st

from physiograph.apdra import analyze, normalize_measurements
from physiograph.stability import characterize
from physiograph.discovery import (median_vs_apdra, comparison_summary,
    snapshot_heatmap, rank_markers, crew_summary, HEATMAP_CODES)
from physiograph.evidence import report as apdra_report
from physiograph.plots import biomarker_line
from physiograph.review_queue import build_review_queue
from physiograph.monitoring import monitor as run_monitor
from physiograph.physioalert import build_physioalerts
from physiograph.workflow import (add_event, allowed_states, current_status,
    export_review_json, import_review_json, UNREVIEWED)
from physiograph.robustness import characterize_magnitude
from physiograph.temporal import trajectory_between_baselines

ROOT = Path(__file__).resolve().parent
NASA = ROOT / "data" / "nasa"
ASSAYS = {
    "Metabolic · 19 analytes": ("osd575_cmp_long.csv", "Metabolic", "Measured concentration / clinical units"),
    "Immune + protein · 203 targets": ("osd575_alamar_npq_long.csv", "Protein", "NPQ (relative log₂ signal)"),
}
TEAL = "#48DDD5"
AMBER = "#F3B365"
PALE = "#AABBD0"
BG = "#091322"
PANEL = "#11243A"

st.set_page_config(page_title="PHYSIOGRAPH | Astronaut Physiology", page_icon="◉", layout="wide", initial_sidebar_state="collapsed")
st.markdown("""
<style>
.block-container{padding-top:1.1rem;padding-bottom:3rem;max-width:1500px}
[data-testid="stAppViewContainer"]{background:radial-gradient(ellipse at 75% 0%, #112a40 0%,#091322 48%,#070f1b 100%)}
[data-testid="stHeader"]{background:transparent}
.hero{background:linear-gradient(110deg,rgba(34,78,107,.64),rgba(10,24,44,.87));border:1px solid #2e536b;border-radius:20px;padding:26px 30px;margin-bottom:16px}
.kicker{font-size:.73rem;letter-spacing:.16em;font-weight:700;color:#65DDD7}
.hero-title{font-size:2.7rem;line-height:1.02;font-weight:750;letter-spacing:-.045em;margin:9px 0 10px}
.hero-p{font-size:1.03rem;color:#c3d3e2;max-width:900px;line-height:1.55}
.pill{display:inline-block;border:1px solid #4c6b81;border-radius:20px;padding:4px 10px;color:#b6d3e3;font-size:.75rem;margin-right:8px;margin-top:4px}
.science-note{color:#abc5d3;font-size:.89rem;line-height:1.55}
[data-testid="stMetric"]{background:#102438;border:1px solid #29475c;border-radius:14px;padding:15px 17px;min-height:105px}
[data-testid="stMetricLabel"]{color:#a9becf!important}
[data-testid="stMetricValue"]{color:#f0f8ff!important}
div[data-testid="stTabs"] button[data-baseweb="tab"]{font-weight:600;letter-spacing:.01em}
h1,h2,h3{letter-spacing:-.035em!important}
[data-testid="stDataFrame"]{border:1px solid #2b465a;border-radius:9px}
</style>
""", unsafe_allow_html=True)

@st.cache_data(show_spinner=False)
def read_nasa_file(filename: str) -> pd.DataFrame:
    path = NASA / filename
    if not path.exists():
        raise FileNotFoundError(f"Missing bundled NASA file: {filename}")
    return pd.read_csv(path)

# Do not globally cache user-submitted biomarker data.
def scored_records(raw: pd.DataFrame, threshold: float) -> pd.DataFrame:
    return analyze(raw, screening_percent=threshold)

# Keep personal measurements outside shared Streamlit data caches.
def evidence_records(raw: pd.DataFrame, threshold: float) -> pd.DataFrame:
    return characterize(raw, threshold_percent=threshold, threshold_npq=1.0)

# Parse uploaded data without cross-session caching.
def read_upload(blob: bytes) -> pd.DataFrame:
    return pd.read_csv(BytesIO(blob))

@st.cache_data(show_spinner=False)
def prepared_nasa(threshold: float):
    by_assay={}
    for label,(filename,short,description) in ASSAYS.items():
        raw=read_nasa_file(filename)
        evidence=evidence_records(raw,threshold)
        compared=median_vs_apdra(evidence,cmp_threshold=threshold,npq_threshold=1.0)
        by_assay[label] = {"raw":raw,"evidence":evidence,"compared":compared,"short":short,"description":description}
    return by_assay


def plot_setup(fig:go.Figure, height:int=410) -> go.Figure:
    fig.update_layout(height=height,paper_bgcolor="rgba(0,0,0,0)",plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="#d9e6ee"),margin=dict(l=14,r=16,t=38,b=18),
        legend=dict(orientation="h",y=-.22, x=0),hoverlabel=dict(bgcolor=PANEL))
    fig.update_xaxes(showgrid=False,zeroline=False)
    fig.update_yaxes(gridcolor="#244057",zeroline=False)
    return fig


def show_comparison_bars(s:dict, comp:dict):
    fig=go.Figure()
    fig.add_trace(go.Bar(name="Consistently flagged by APDRA",x=["Metabolic", "Immune / protein"],
        y=[int(comp["Metabolic · 19 analytes"].median_flagged.sum())-int(comp["Metabolic · 19 analytes"].flag_not_stable.sum()),
           int(comp["Immune + protein · 203 targets"].median_flagged.sum())-int(comp["Immune + protein · 203 targets"].flag_not_stable.sum())],
        marker_color=TEAL))
    fig.add_trace(go.Bar(name="Baseline-dependent flag",x=["Metabolic", "Immune / protein"],
        y=[int(comp["Metabolic · 19 analytes"].flag_not_stable.sum()),int(comp["Immune + protein · 203 targets"].flag_not_stable.sum())],
        marker_color=AMBER))
    fig.update_layout(barmode="stack",yaxis_title="Conventional screen-positive measurements")
    return plot_setup(fig,340)


def make_heatmap(evidence:pd.DataFrame,timepoint:str,markers:list[str]):
    matrix=snapshot_heatmap(evidence,timepoint=timepoint,markers=markers)
    if matrix.empty:
        return None
    # Numeric codes are categories. Missing samples stay as null (not 'normal').
    cs=[[0.0,"#234057"],[.24,"#234057"],[.25,"#F3B365"],[.49,"#F3B365"],
        [.5,"#48DDD5"],[.74,"#48DDD5"],[.75,"#A479D9"],[1.0,"#A479D9"]]
    fig=go.Figure(go.Heatmap(z=matrix.values,x=list(matrix.columns),y=list(matrix.index),
        zmin=-.5,zmax=3.5,colorscale=cs,showscale=False,
        hovertemplate="Biomarker: %{y}<br>Crew: %{x}<br>Screen code: %{z}<extra></extra>",
        xgap=3,ygap=2))
    fig.update_yaxes(autorange="reversed",type="category",tickfont=dict(size=10))
    fig.update_xaxes(side="top",title=None)
    return plot_setup(fig,max(345,min(960,110+len(matrix.index)*23)))


def trajectory_chart(raw:pd.DataFrame, biomarker:str, normalized:bool):
    selected=raw[raw.biomarker==biomarker].copy()
    scored=scored_records(selected,30.)
    selected_value = "delta" if selected.unit.iloc[0]=="NPQ (log2)" else "percent_change"
    if normalized:
        label="Δ NPQ (log₂ units)" if selected_value=="delta" else "Change from individual preflight median (%)"
        if selected_value=="percent_change" and scored[selected_value].isna().all():
            return None,label
        fig=px.line(scored.sort_values('time_numeric'), x='time_numeric',y=selected_value,
                    color='subject_id',markers=True,hover_data=['timepoint','value'],
                    color_discrete_sequence=[TEAL,AMBER,"#9e95f2","#88c8eb"])
        fig.add_hline(y=0,line_dash='dot',line_color='#8ca5b4')
    else:
        label=f"{biomarker} ({selected.unit.iloc[0]})"
        fig=biomarker_line(scored,color='subject_id')
    fig.update_yaxes(title=label)
    fig.update_xaxes(title="Approximate mission-relative day (return ~day 3)")
    return plot_setup(fig,395),label


def baseline_inspector(evidence:pd.DataFrame,raw:pd.DataFrame,threshold:float,tag:str):
    if evidence.empty:
        st.info("No measurements available")
        return
    crew=st.selectbox("Crew member",sorted(evidence.subject_id.unique()),key=f"person-{tag}")
    names=sorted(evidence[evidence.subject_id==crew].biomarker.unique())
    preferred="IL6" if "IL6" in names else "ALBUMIN" if "ALBUMIN" in names else names[0]
    marker=st.selectbox("Biomarker",names,index=names.index(preferred),key=f"marker-{tag}")
    chosen=evidence[(evidence.subject_id==crew)&(evidence.biomarker==marker)].sort_values('time_numeric')
    original=raw[(raw.subject_id==crew)&(raw.biomarker==marker)]
    cmp=median_vs_apdra(chosen,cmp_threshold=threshold)
    rep=apdra_report(chosen)
    c1,c2,c3=st.columns(3)
    c1.metric("Preflight samples",rep['baseline_n'])
    c2.metric("Latest sample",rep['latest_timepoint'] or 'None')
    c3.metric("Direction",rep['direction'])
    st.caption(rep['summary'])
    scored=scored_records(original,threshold)
    fig=biomarker_line(scored,baseline=rep['baseline_center'])
    fig.update_yaxes(title=f"{marker} ({chosen.unit.iloc[0]})")
    st.plotly_chart(plot_setup(fig,335),width='stretch',key=f"series-{tag}")
    st.markdown("**What does conventional screening flag, compared with APDRA?**")
    rows=cmp[~cmp.phase.isin(['preflight','baseline'])].copy()
    columns=['timepoint','value','median_flagged','apdra_consistent','screening_stability']
    if not rows.empty:
        st.dataframe(rows[columns].rename(columns={'median_flagged':'Median rule flag',
            'apdra_consistent':'Consistent under baseline omission',
            'screening_stability':'APDRA classification'}),hide_index=True,width='stretch')
        st.caption("Both rules use the same exploratory threshold and individual baseline. False in the APDRA column means *not consistently screened*, not medically safe.")
    st.markdown("**Baseline stability:** "+rep['baseline_sensitivity'])
    st.markdown("**Postflight pattern:** "+rep['trend'])
    st.markdown("**Source laboratory interval:** "+rep['source_interval'])
    if rep['loo_span']:
        lo,hi=rep['loo_span']
        st.caption(f"Leave-one-out baseline medians ranged from {lo:.3g} to {hi:.3g} {chosen.unit.iloc[0]}. This is not a confidence interval.")
    t=trajectory_between_baselines(scored)
    if t.elapsed_days is not None:
        st.caption(f"Time-aware pattern: {t.label}; postflight observation span {t.elapsed_days:.0f} days. Movement toward baseline is not proof of clinical recovery.")
    baseline=original[original.phase.isin(['preflight','baseline'])].value.to_numpy(float)
    post=rows.sort_values('time_numeric')
    if len(post):
        latest=post.iloc[-1]
        robust=characterize_magnitude(baseline,float(latest.value),str(latest.unit))
        if robust.minimum_omission_deviation is not None:
            st.caption(f"Cutoff-independent leave-one-out magnitude range: {robust.minimum_omission_deviation:.2f} to {robust.maximum_omission_deviation:.2f} {robust.deviation_unit}.")
    st.download_button("Export this biomarker's evidence",chosen.to_csv(index=False),
        f"PHYSIOGRAPH_{tag}_{crew}_{marker.replace(' ','_')}.csv",'text/csv',key=f"exp-{tag}-{crew}-{marker}")


st.markdown("""
<div class="hero">
  <div class="kicker">NASA SPACE APPS 2026 · SCIENCE-LED HEALTH MONITORING</div>
  <div class="hero-title">PHYSIOGRAPH <span style="color:#5ee0d5">/</span> Mission Physiology</div>
  <div class="hero-p">Explore real Inspiration4 biomarker changes. Test how stable each personal comparison is when only a few preflight readings are available. Then use the same transparent method to monitor new measurements.</div>
  <div><span class="pill">NASA OSD-575</span><span class="pill">APDRA · frozen v0.7</span><span class="pill">PhysioAlert · v0.9</span><span class="pill">Research prototype, not a medical device</span></div>
</div>
""",unsafe_allow_html=True)

try:
    nasa_fixed=prepared_nasa(30.)
except Exception as exc:
    st.error(f"Unable to load NASA research data: {exc}")
    st.stop()

comparison={name:v['compared'] for name,v in nasa_fixed.items()}
headline=comparison_summary(comparison)

with st.sidebar:
    st.markdown('### Research settings')
    threshold=st.slider('Metabolic exploratory cutoff (%)',min_value=10,max_value=60,value=30,step=5,
        help='For descriptive screening only; not an authorized medical threshold. Immune NPQ uses 1.0 log₂-unit cutoff.')
    st.caption('The 34.9% published demonstration is fixed at 30% CMP and ΔNPQ 1.0, regardless of this exploratory slider.')
    st.link_button('NASA study source','https://osdr.nasa.gov/bio/repo/data/studies/OSD-575')
    st.download_button('Download monitoring CSV template',
        (ROOT/'data/templates/measurements_template.csv').read_bytes(),
        file_name='physiograph_measurement_template.csv',mime='text/csv')

overview_tab, explorer_tab, monitor_tab, methods_tab=st.tabs([
    '01  /  Discoveries', '02  /  Research explorer', '03  /  Astronaut monitor + PhysioAlert', '04  /  Methods & evidence'])

with overview_tab:
    st.markdown('### When does a personal baseline change the interpretation?')
    c1,c2,c3,c4=st.columns(4)
    c1.metric('Inspiration4 crew',4)
    c2.metric('Assay targets',222,help='19 metabolic analytes and 203 immune/protein targets; not all independent physiological systems')
    c3.metric('Conventional flags',headline['median_flagged'])
    c4.metric('Baseline-dependent flags',f"{headline['conditional_percent']:.1f}%")
    st.markdown(f"**{headline['not_stable']} of {headline['median_flagged']}** postflight readings flagged by a single-median rule did **not** remain consistently flagged after leaving out each preflight reference measurement. The other **{headline['stable']}** were consistently flagged under those omissions.")
    st.caption('Denominator: the 195 conventional *screen-positive measurement records*, not all readings, 4 astronauts, or independent medical diagnoses. This is conditional on an illustrative 30% CMP cutoff and a 1.0 NPQ-unit protein cutoff. No medical abnormalities are inferred.')
    left,right=st.columns([1.25,1],gap='large')
    with left:
        st.markdown('#### Evidence stability by assay')
        st.plotly_chart(show_comparison_bars(headline,comparison),width='stretch')
        st.caption('Metabolic 25 conventional flags: 7 baseline-dependent. Protein 170 conventional flags: 61 baseline-dependent. Each panel retains its own units.')
    with right:
        st.markdown('#### Why this matters')
        st.info('A flag from one median can appear definite even when the underlying reference comes from just two or three preflight samples. APDRA shows when the conclusion depends on those sparse observations.')
        st.markdown('**The finding does not prove:** health problems, incorrect laboratory results, clinical benefit, or causal effects of spaceflight.')
        st.link_button('Explore NASA OSD-575 original study','https://osdr.nasa.gov/bio/repo/data/studies/OSD-575')
    st.markdown('#### Explore the full physiological evidence, not only the headline')
    select = st.selectbox('NASA assay',list(ASSAYS),key='overview-assay')
    ev=nasa_fixed[select]['evidence']
    crew=crew_summary(ev)
    st.dataframe(crew,hide_index=True,width='stretch')
    st.caption('Counts are observation-level and correlated within each crew member. Comparisons across assays are not equivalent medical categories.')
    st.markdown('#### Sample evidence map')
    a,b=st.columns([1,1.5])
    with a:
        sample_day=st.selectbox('Postflight sampling day',sorted(ev[ev.phase=='postflight'].timepoint.unique(),key=lambda x:int(x[2:])),key='overview-day')
        limit=st.slider('Biomarkers to display',10,50,25,step=5)
    markers=rank_markers(ev,limit=limit)
    st.plotly_chart(make_heatmap(ev,sample_day,markers),width='stretch')
    st.caption('Heatmap colors: dark = no consistent screen; amber = baseline-sensitive; teal = consistently screened; purple = insufficient baseline. Blank = missing measurement. Biomarkers are ordered by number of baseline-sensitive readings for display, not medical urgency.')

with explorer_tab:
    st.markdown('### Scientific Research Explorer')
    st.caption('NASA Inspiration4 serum observations, before launch and after the three-day mission. No continuous in-flight serum biomarker measurements. All participant codes are pseudonymous.')
    assay=st.radio('Assay for investigation',list(ASSAYS),horizontal=True,key='explorer-assay')
    file=nasa_fixed[assay]
    raw=file['raw']; ev=evidence_records(raw,threshold)
    st.caption(file['description'])
    tabheat,tabcompare,tabdetails,tabreview=st.tabs(['Biomarker heatmap','Compare crew trajectories','APDRA evidence inspector','Verification queue'])
    with tabheat:
        day=st.selectbox('Actual NASA postflight timepoint',sorted(ev[ev.phase=='postflight'].timepoint.unique(),key=lambda x:int(x[2:])),key='research-day')
        options=rank_markers(ev,limit=45)
        picks=st.multiselect('Biomarkers (top baseline-sensitive displayed by default)',options,default=options[:24],key='heatmap-picks')
        fig=make_heatmap(ev,day,picks)
        if fig:
            st.plotly_chart(fig,width='stretch')
        else:
            st.info('Select at least one measured biomarker.')
        st.caption('Each square is one observed biomarker/crew/sample combination. This is a visualization of screening categories, not a health-severity heatmap.')
    with tabcompare:
        all_markers=sorted(raw.biomarker.unique())
        preferred='IL6' if 'IL6' in all_markers else 'ALBUMIN' if 'ALBUMIN' in all_markers else all_markers[0]
        target=st.selectbox('Compare the same biomarker in all four crew members',all_markers,index=all_markers.index(preferred),key='compare-marker')
        relative=st.toggle('Show within-person change instead of raw measurements',value=True)
        fig,lab=trajectory_chart(raw,target,relative)
        if fig:
            st.plotly_chart(fig,width='stretch')
        st.caption('X-axis uses actual relative-day spacing. For NPQ we show Δlog₂ signal, not percentage changes in NPQ. Cross-crew trajectories are observational, not proof of spaceflight causation.')
        selected=scored_records(raw[raw.biomarker==target],threshold)
        late=selected[selected.phase=='postflight'].copy()
        if len(late):
            cols=['subject_id','timepoint','value','baseline_median','delta']
            if selected.unit.iloc[0]!='NPQ (log2)': cols.append('percent_change')
            st.dataframe(late[cols],width='stretch',hide_index=True)
    with tabdetails:
        baseline_inspector(ev,raw,threshold,tag=f"nasa-{file['short']}")
    with tabreview:
        st.caption('Verification categories reflect evidence and screening uncertainty, NOT clinical urgency. PhysioAlert shows the latest nonbaseline reading per marker/assay, so its counts differ from the measurement-level 34.9% research finding. Follow authorized crew medical procedures for real health concerns.')
        queue=build_physioalerts(ev, already_characterized=True)
        types=list(queue.review_category.unique())
        show=st.multiselect('Verification reasons',types,default=[x for x in types if x!='No current verification prompt'],key='research-queue-filter')
        st.dataframe(queue[queue.review_category.isin(show)][['subject_id','biomarker','timepoint','value','review_category','reason','verification_actions']],hide_index=True,width='stretch')
        st.download_button('Export NASA measurement review queue',queue.to_csv(index=False),
            file_name=f"physiograph_{file['short'].lower()}_verification.csv",mime='text/csv')

with monitor_tab:
    st.markdown('### Personal biomarker monitoring workspace')
    st.caption('Enter or upload repeated measurements using a subject code. The software compares readings with their own earlier baselines; it does not diagnose, determine medical fitness, or issue treatments. Avoid identifiable personal medical information in public demos.')
    entry=st.radio('How would you like to provide measurements?',
        ['Simulated demonstration','Upload CSV','Manual entry'],horizontal=True,key='monitor-source')
    monitor_raw=None
    if entry=='Simulated demonstration':
        st.info('SIMULATED demonstration only. These values are not NASA observations or clinically measured data.')
        monitor_raw=pd.read_csv(ROOT/'data/templates/measurements_template.csv')
    elif entry=='Upload CSV':
        up=st.file_uploader('Long-format measurements CSV',type='csv',key='personal-csv')
        if up is not None:
            try: monitor_raw=read_upload(up.getvalue())
            except Exception as exc: st.error(f'Unable to read CSV: {exc}')
    else:
        if 'manual_v08' not in st.session_state:
            st.session_state.manual_v08=[]
        with st.form('manual-v08',clear_on_submit=True):
            x,y,z=st.columns(3)
            sid=x.text_input('Subject code',value='CREW-001')
            when=y.text_input('Date (YYYY-MM-DD), L−day or R+day',value='2026-11-14')
            phase=z.selectbox('Measurement stage',['baseline','preflight','monitoring','postflight'])
            x,y,z,q=st.columns(4)
            marker=x.text_input('Biomarker',value='Example analyte')
            val=y.number_input('Measured value',value=10.0,format='%.5f')
            unit=z.text_input('Unit',value='AU')
            system=q.text_input('Panel / system',value='User entry')
            if st.form_submit_button('Add reading'):
                if all(str(v).strip() for v in (sid,when,marker,unit)):
                    st.session_state.manual_v08.append(dict(subject_id=sid.strip(),timepoint=when.strip(),
                        biomarker=marker.strip(),value=val,unit=unit.strip(),system=system.strip(),
                        phase=phase,source='MANUAL - NOT NASA'))
                else:
                    st.error('Subject code, date, biomarker, and unit are required.')
        if st.session_state.manual_v08:
            monitor_raw=pd.DataFrame(st.session_state.manual_v08)
            x,y=st.columns([2,1])
            x.download_button('Export entered readings',monitor_raw.to_csv(index=False),
                file_name='physiograph_manual_entries.csv',mime='text/csv')
            if y.button('Clear session entries'):
                st.session_state.manual_v08=[]
                st.rerun()
    if 'review_events_v09' not in st.session_state:
        st.session_state.review_events_v09=[]
    if monitor_raw is not None:
        try:
            monitoring=run_monitor(monitor_raw,threshold_percent=threshold,
                review_events=st.session_state.review_events_v09)
            ev=monitoring.evidence
            alerts=monitoring.alerts
            count=crew_summary(ev)
            st.markdown('#### Personal evidence overview')
            if len(count): st.dataframe(count,hide_index=True,width='stretch')
            else: st.info('Add a later measurement after at least two reference observations to examine baseline sensitivity.')
            tabtrend,tabalert,tabworkflow=st.tabs([
                'Personal trajectory and APDRA', 'PhysioAlert evidence', 'Verification workflow'])
            with tabtrend:
                baseline_inspector(ev,monitoring.measurements,threshold,tag='monitor')
            with tabalert:
                st.caption('PhysioAlert describes anomalous measurements for verification, not diseases, health status, or clinical emergencies. Only the latest reading for each biomarker/source is shown.')
                p1,p2,p3=st.columns(3)
                p1.metric('Markers monitored',len(alerts))
                p2.metric('Findings for verification',int(alerts.is_flagged.sum()))
                p3.metric('Not flagged',int((~alerts.is_flagged).sum()))
                visible=['subject_id','biomarker','unit','timepoint','value',
                    'review_category','screening_stability','source_interval_status','review_status']
                st.dataframe(alerts[visible],hide_index=True,width='stretch')
                st.download_button('Export PhysioAlert analysis',alerts.to_csv(index=False),
                    file_name='physiograph_physioalert_observations.csv',mime='text/csv')
                if len(alerts):
                    selected=st.selectbox('Inspect an observation',range(len(alerts)),
                        format_func=lambda ix: f"{alerts.iloc[ix].subject_id} · {alerts.iloc[ix].biomarker} · {alerts.iloc[ix].timepoint}",
                        key='alert-inspection')
                    row=alerts.iloc[selected]
                    st.markdown('**Why it was highlighted**')
                    st.write(row.reason)
                    st.markdown('**Possible verification steps**')
                    st.write(row.verification_actions)
                    st.caption(row.interpretation_limit)
            with tabworkflow:
                st.caption('This is a demonstration of documenting follow-up actions, not a medical protocol or clinical record. Review decisions stay in this browser session unless you explicitly export the event JSON.')
                if alerts.empty:
                    st.info('No later observations to review yet.')
                else:
                    active=alerts[alerts.is_flagged]
                    if active.empty:
                        st.info('No exploratory verification criteria were triggered. This does not establish health normality.')
                        active=alerts
                    chosen_index=st.selectbox('Choose measurement to review',range(len(active)),
                        format_func=lambda ix: f"{active.iloc[ix].subject_id} · {active.iloc[ix].biomarker} ({active.iloc[ix].timepoint})",
                        key='workflow-pick')
                    picked=active.iloc[chosen_index]
                    current=current_status(picked.alert_id,st.session_state.review_events_v09)
                    st.write(f'**Current review status:** {current}')
                    with st.form('change-review-state',clear_on_submit=False):
                        action=st.selectbox('Record follow-up action',allowed_states(current))
                        actor=st.text_input('Reviewer code (pseudonym)',value='CREW-DEMO')
                        submitted=st.form_submit_button('Record review action')
                        if submitted:
                            try:
                                st.session_state.review_events_v09=add_event(
                                    st.session_state.review_events_v09,picked.alert_id,action,actor_code=actor)
                                st.success('Review action recorded in this session.')
                                st.rerun()
                            except Exception as exc:
                                st.error(f'Unable to record review action: {exc}')
                st.markdown('#### Review event log')
                events=st.session_state.review_events_v09
                if events:
                    st.dataframe(pd.DataFrame(events),hide_index=True,width='stretch')
                else:
                    st.caption('No review actions have been recorded yet.')
                st.download_button('Export review event log (JSON)',export_review_json(events),
                    file_name='physiograph_review_actions.json',mime='application/json')
                uploaded_review=st.file_uploader('Restore a previously exported review log',
                    type='json',key='restore-review-json')
                if uploaded_review is not None and st.button('Validate and restore review log'):
                    try:
                        st.session_state.review_events_v09=import_review_json(uploaded_review.getvalue())
                        st.success('Review log validated and restored for this session.')
                        st.rerun()
                    except Exception as exc:
                        st.error(f'Invalid review log: {exc}')
                stale=sum(1 for e in events if e['alert_id'] not in set(alerts.alert_id))
                if stale:
                    st.warning(f'{stale} review events are for measurements not in the current dataset. They are retained in the exported history but do not change current alert statuses.')
                if st.button('Clear session review log',key='clear-review-v09'):
                    st.session_state.review_events_v09=[]
                    st.rerun()
                st.caption('Use demonstration identifiers only. Do not upload identifiable patient records to a public prototype. The application does not encrypt or store these actions in a clinical database.')
        except Exception as exc:
            st.error(f'Input validation or analysis failed: {exc}')

with methods_tab:
    st.markdown('### What we can conclude, and what we cannot')
    st.markdown('''
**What APDRA does:** It uses each individual's observed preflight/reference median, repeats the exploratory comparison leaving out one baseline reading at a time, and describes whether later measurements are consistently screened or baseline-sensitive. It can describe movement toward the reference but cannot establish clinical recovery.

**What 34.9% means:** Of 195 individual NASA postflight measurements flagged by a conventional single-median heuristic at fixed demonstration cutoffs, 68 were not consistently flagged across leave-one-out references. They are *measurements*, not independent astronaut outcomes. The finding does not establish the correct clinical threshold.

**What the synthetic benchmark tests:** Numeric change detection under deliberately generated outliers and noise, calibrated at approximately matched false-screen rates. Performance was condition-dependent, not universally superior. It is not clinical validation.

**What remains unknown:** Whether this changes astronaut medical outcomes, whether all protein signals correspond to medically useful biomarkers, or whether the same behavior holds for other crews and missions.
''')
    st.markdown('#### Selected peer-reviewed scientific context')
    refs=[
        ('2019 NASA Twins Study · Science','https://doi.org/10.1126/science.aau8650','Documents multi-system physiological variation and mixed recovery patterns after long-duration spaceflight.'),
        ('2024 Space Omics and Medical Atlas · Nature','https://doi.org/10.1038/s41586-024-07639-y','Provides scientific motivation for longitudinal and individualized interpretation of multiple spaceflight assays.'),
        ('2024 Inspiration4 immune study · Nature Communications','https://doi.org/10.1038/s41467-024-49211-2','Explores biological changes in Inspiration4 crew using dedicated analysis; our heuristics are not a statistical replication.'),
        ('Reference intervals and their limitations · Diagnostics','https://pmc.ncbi.nlm.nih.gov/articles/PMC10932992/','Supports keeping population laboratory intervals and within-person serial comparisons conceptually separate.'),
    ]
    for name,url,why in refs:
        with st.expander(name):
            st.write(why)
            st.link_button('Read publication',url)
    st.markdown('#### Reproducible research artifacts')
    st.download_button('Download final APDRA validation report',
        (ROOT/'FINAL_APDRA_VALIDATION_REPORT.md').read_bytes(),
        file_name='PHYSIOGRAPH_APDRA_validation.md',mime='text/markdown')
    summary_path=ROOT/'research/apdra_v07_final_validation/summary_with_seed_ci95.csv'
    if summary_path.exists():
        st.download_button('Download synthetic benchmark summary',summary_path.read_bytes(),
            file_name='APDRA_synthetic_benchmark_summary.csv',mime='text/csv')
    st.caption('NASA OSD-575 · Inspiration4: four astronauts, sparse serum samples. NPQ is a log₂ relative assay signal. No LLM API, cloud transfer of user-entered measurements, or clinical decision engine is enabled.')
