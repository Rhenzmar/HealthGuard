"""Evidence-focused visualization of the downloaded NASA OSD-575 assays."""
from __future__ import annotations
from pathlib import Path

import pandas as pd
import plotly.express as px
from physiograph.plots import biomarker_line
from physiograph.overview import measurement_overview
from physiograph.review_queue import build_review_queue
import streamlit as st


def show_verified_research(root: Path, threshold: float, view_analysis, evaluate, stability_evidence) -> None:
    st.subheader("Inspiration4 physiological research explorer")
    st.caption("Authentic NASA OSD-575 serum data. Four crew members; sampled before launch "
               "and after return. These are not continuous measurements onboard the spacecraft.")
    st.link_button("Source: NASA OSD-575", "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575")
    choice=st.radio("Verified NASA assay",[
        "Comprehensive metabolic panel (original clinical units)",
        "Alamar inflammation / protein panel (NPQ log2)"],horizontal=True)
    if choice.startswith("Comprehensive"):
        file=root / "data/nasa/osd575_cmp_long.csv"
        label="Metabolic"
        description="509 numeric measurements, 19 laboratory analytes; 22 missing source values excluded. Original per-analyte units are retained."
    else:
        file=root / "data/nasa/osd575_alamar_npq_long.csv"
        label="Immune"
        description="27 samples × 203 proteins. NPQ is a normalized log2 relative signal, not a clinical concentration. C003 L−44 is absent."
    if not file.exists():
        st.error("Verified NASA data are not bundled in this installation. Download the v0.2 package or import them from the original NASA files.")
        return
    raw=pd.read_csv(file)
    st.caption(description)
    st.markdown("#### APDRA evidence-stability overview")
    st.caption("Summary of individual *measurement-level screening labels*, not counts of illness, pathology, or independently confirmed spaceflight effects. Each assay is analyzed separately.")
    evidence=stability_evidence(raw,threshold)
    overview=measurement_overview(evidence)
    if len(overview):
        counts=overview.groupby("class",observed=True)["count"].sum()
        n=int(overview.groupby("subject_id")["denominator"].first().sum())
        a,b,c,d=st.columns(4)
        a.metric("Evaluated later readings",f"{n:,}")
        b.metric("Consistent screens",f"{int(counts.get('Consistent exploratory screen',0)):,}")
        c.metric("Baseline-sensitive",f"{int(counts.get('Baseline-sensitive screen',0)):,}")
        d.metric("Cannot evaluate",f"{int(counts.get('Cannot evaluate',0)):,}")
        pivot=overview.pivot(index="subject_id",columns="class",values="percent").fillna(0)
        pivot=pivot.reindex(columns=["Consistent exploratory screen", "Baseline-sensitive screen", "No consistent screen", "Cannot evaluate"],fill_value=0)
        fig_overview=px.bar(pivot.reset_index().melt(id_vars="subject_id",var_name="Screen category",value_name="Share of later readings (%)"),
            x="subject_id",y="Share of later readings (%)",color="Screen category",barmode="stack",
            labels={"subject_id":"Crew code"},title="Share of later measurements by baseline-stability category")
        fig_overview.update_layout(height=360,margin=dict(l=10,r=5,t=44,b=10),legend_title_text="Exploratory classification")
        st.plotly_chart(fig_overview,width="stretch")
        with st.expander("View denominators and exact counts"):
            st.dataframe(overview,width="stretch",hide_index=True)
        st.caption("A crew with missing samples has a different denominator. NPQ uses a fixed 1.0 log2-unit exploratory threshold; clinical analytes use the sidebar relative-change threshold. Neither is a diagnosis or a validated reference change value.")
        with st.expander("APDRA v0.6 | Measurement verification queue"):
            st.caption("Latest postflight sample per astronaut and biomarker. Sorted by record-verification reason, NOT by medical urgency. This is not a diagnostic or treatment queue.")
            queue=build_review_queue(evidence)
            categories=sorted(queue.review_category.unique())
            included=st.multiselect("Show verification categories",categories,default=[c for c in categories if c!='No current verification prompt'],key=f"review_filter_{label}")
            filtered=queue[queue.review_category.isin(included)]
            st.dataframe(filtered,width="stretch",hide_index=True)
            st.download_button("Export nonclinical verification queue",queue.to_csv(index=False),file_name=f"physiograph_{label.lower()}_verification_queue.csv",mime="text/csv")
    st.divider()
    view_analysis(raw,threshold,context=f"NASA-OSD-575-{label}")
    st.subheader("Compare crew trajectories")
    st.caption("Compare **the same biomarker** between crew members. Preflight baselines are computed separately for each person; "
               "a difference alone does not establish an effect of spaceflight.")
    biomarker=st.selectbox("Biomarker for crew comparison",sorted(raw.biomarker.unique()),
                           index=sorted(raw.biomarker.unique()).index("IL6") if label=="Immune" else sorted(raw.biomarker.unique()).index("GLUCOSE"),
                           key=f"cross_{label}")
    chosen=raw[raw.biomarker==biomarker].copy()
    scored=evaluate(chosen,threshold)
    # Use separate trace for each crew, and sort timepoints explicitly.
    scored=scored.sort_values(["time_numeric","subject_id"])
    label_unit=scored.unit.iloc[0]
    fig=biomarker_line(scored,color="subject_id",title=f"{biomarker} · comparison across crew")
    fig.update_yaxes(title_text=f"{biomarker} ({label_unit})")
    st.plotly_chart(fig,width="stretch")
    st.caption("True spacing between sample days; blank intervals are not interpolated in-flight measurements.")
    post=scored[scored.phase=="postflight"].copy()
    if post.empty:
        st.info("No postflight measurements in this selection")
    else:
        if label=="Immune":
            value="delta"
            title="Postflight change from personal preflight median (ΔNPQ, log2)"
            st.caption("ΔNPQ is valid for within-protein relative comparisons. An increase of 1 NPQ unit is approximately a doubling of relative signal. "
                       "Do not treat numerical NPQ values as absolute protein concentrations.")
        else:
            value="percent_change"
            title="Postflight relative change from personal preflight median (%)"
            st.caption("These relative changes are exploratory only. A large change is not proof of pathology or recovery.")
        heat=post.pivot_table(index="subject_id",columns="timepoint",values=value,aggfunc="first")
        heat=heat.reindex(columns=[x for x in ["R+1","R+45","R+82","R+194"] if x in heat.columns])
        if heat.notna().any().any():
            fig2=px.imshow(heat,aspect="auto",text_auto=".2f",
                labels={"x":"Postflight sample","y":"Crew code","color": "ΔNPQ" if label=="Immune" else "% change"},
                title=title)
            fig2.update_layout(height=330,margin=dict(l=5,r=5,t=35,b=5))
            st.plotly_chart(fig2,width="stretch")
    st.caption("Source: NASA OSD-575, four Inspiration4 crew members. These are sparse longitudinal observational results, "
               "not a validated diagnosis, proof of causal spaceflight effects, or generalizable population inference.")
