# PHYSIOGRAPH: primary data sources and provenance

- NASA Space Apps Challenge 2026: Create Health Monitoring Software for Astronauts on Space Missions. https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/
- NASA OSDR-575 v3: SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays. DOI 10.26030/mc5d-p710. CC0-1.0. https://osdr.nasa.gov/bio/repo/data/studies/OSD-575
- NASA OSDR Data File API reference: https://api.nasa.gov/ (OSDR API section)
- NASA OSDR FAQ and download guide: https://science.nasa.gov/reference/osdr-faq/
- NASA Inspiration4 collection context: https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/

NASA OSD-575 has 4 subjects and 28 listed serum samples across the L-92/L-44/L-3 and R+1/R+45/R+82/R+194 sample metadata. The study description lists primary collections at preflight L-92/L-44/L-3 and postflight R+1/R+45/R+82. Do not assume every biomarker assay has all 28 observations or that each marker is directly comparable between labs and platforms.

Actual NASA-source assay CSV files WERE provided and parsed for v0.2–v0.5. The bundled long tables contain 509 numeric CMP results and 5,481 Alamar NPQ values. The source metadata and assay-specific fields must be retained, and downstream interpretations remain nonclinical. The transformation is reproducible using tools/import_osd575.py and the three original provided source files.

See research/scientific_evidence_review.md for peer-reviewed scientific rationale and methodological limitations.
