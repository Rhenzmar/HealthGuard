# PHYSIOGRAPH: primary data sources and provenance

- NASA Space Apps Challenge 2026: Create Health Monitoring Software for Astronauts on Space Missions. https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/
- NASA OSDR-575 v3: SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays. DOI 10.26030/mc5d-p710. CC0-1.0. https://osdr.nasa.gov/bio/repo/data/studies/OSD-575
- NASA OSDR Data File API reference: https://api.nasa.gov/ (OSDR API section)
- NASA OSDR FAQ and download guide: https://science.nasa.gov/reference/osdr-faq/
- NASA Inspiration4 collection context: https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/

NASA OSD-575 has 4 subjects and 28 listed serum samples across the L-92/L-44/L-3 and R+1/R+45/R+82/R+194 sample metadata. The study description lists primary collections at preflight L-92/L-44/L-3 and postflight R+1/R+45/R+82. Do not assume every biomarker assay has all 28 observations or that each marker is directly comparable between labs and platforms.

Actual NASA-source assay CSV files WERE provided and parsed for v0.2–v0.5. The bundled long tables contain 509 numeric CMP results and 5,481 Alamar NPQ values. The source metadata and assay-specific fields must be retained, and downstream interpretations remain nonclinical. The transformation is reproducible using tools/import_osd575.py and the three original provided source files.

See research/scientific_evidence_review.md for peer-reviewed scientific rationale and methodological limitations.


## Later NASA-source evaluations (November 2026)

The source list above documents the initial OSD-575 scope. Subsequent *separate* retrospective research also analyzed:

- **NASA OSD-569 (Inspiration4 CBC)**: https://osdr.nasa.gov/bio/repo/data/studies/OSD-569
- **NASA OSD-575 extended panels**: CMP, Alamar NPQ, EVE immune and EVE cardiovascular, individually retaining NASA source units, assay identity and sample IDs. The later verified retrospective report totals **8,783 numeric observations** across OSD-569 and OSD-575, rather than the earlier 5,990 OSD-575 values.
- **NASA ISS RR-1 environmental assessment**: original source-labeled historical telemetry, radiation and summary files examined in a separate 3-channel engineering screening exercise. The observed five-minute environmental cadence is not the simulated continuous crew signal.

For original-file checksums, limitations, exact input provenance and the full screening counts, see:

- [NASA OSD-569/575 real-data evaluation](nasa_real_data_evaluation/REPORT.md)
- [ISS RR-1 environmental evaluation](nasa_rr1_eda_evaluation/REPORT.md)
- [Verified NASA source manifest](../data/nasa/verified/verified_manifest.json)

**Provenance separation:** Neither the NASA laboratory assays nor ISS RR-1 provide 17 synchronized one-second physiological and engineering features. They were not used as real-data validation for the synthetic-trained 17-input CNN.
