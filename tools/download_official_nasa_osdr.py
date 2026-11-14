"""Download explicitly named original NASA OSDR files, with no mirror fallback.

Usage:
    python -m tools.download_official_nasa_osdr
    python -m tools.download_official_nasa_osdr --output data/external/nasa_osdr

Files are requested solely from NASA's OSDR data service over HTTPS. Failed
downloads are reported as failures; they are never substituted with synthetic
or unofficial data. SHA-256, download time, source URL and file size are logged.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parent.parent
HOST='https://osdr.nasa.gov'
STUDIES={
    'OSD-569':(
        'LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv',
    ),
    'OSD-575':(
        'LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv',
        'LSDS-8_Multiplex_serum_immune_EvePanel_TRANSFORMED.csv',
        'LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv',
        'LSDS-8_Multiplex_serum.immune.AlamarPanel_TRANSFORMED.csv',
    ),
}


def url_for(study: str, filename: str) -> str:
    if study not in STUDIES or filename not in STUDIES[study]:
        raise ValueError('Only predeclared NASA dataset file names are supported')
    return (f'{HOST}/geode-py/ws/studies/{study}/download?'
            + urlencode({'source':'datamanager','file':filename}))


def check_csv(blob: bytes, expected_study: str, name: str):
    if not blob or len(blob) > 80_000_000:
        raise ValueError('Empty or unexpectedly oversized NASA file')
    try:
        content=blob.decode('utf-8-sig')
    except UnicodeDecodeError as exc:
        raise ValueError('Expected UTF-8 CSV file') from exc
    if content.lstrip().startswith(('<!DOCTYPE','<html','{')):
        raise ValueError('Response resembles HTML/JSON, not the requested NASA CSV')
    reader=csv.reader(content.splitlines())
    try:header=next(reader)
    except StopIteration:raise ValueError('Missing source CSV header')
    first=next(reader,None)
    if first is None or len(header)<3:
        raise ValueError('Missing source CSV measurements')
    if len(first)!=len(header):
        raise ValueError('Malformed first CSV row: number of columns differs from header')
    if expected_study=='OSD-569' and 'Sample Name' not in header:
        raise ValueError('OSD-569 CBC column schema mismatch')
    return {'header_columns':len(header),'first_data_columns':len(first)}


def fetch_file(study: str, name: str, directory: Path, timeout: float=40):
    url=url_for(study,name)
    request=Request(url,headers={
        'User-Agent':'HealthGuard-NASA-OSDR-Provenance-Downloader/1.0',
        'Accept':'text/csv,application/octet-stream;q=0.9',
    })
    with urlopen(request,timeout=timeout) as response:
        final_url=response.geturl()
        if not final_url.startswith(HOST+'/'):
            raise ValueError('Unexpected redirect destination outside NASA OSDR')
        blob=response.read(80_000_001)
    validation=check_csv(blob,study,name)
    out=directory/study/name
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_bytes(blob)
    return {
        'study':study,'file':name,'status':'DOWNLOADED_FROM_NASA_OSDR',
        'request_url':url,'resolved_url':final_url,
        'retrieved_utc':datetime.now(timezone.utc).isoformat(),
        'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),
        'local_file':str(out),'csv_schema':validation,
    }


def download(output: Path, timeout: float=40):
    entries=[]
    for study,names in STUDIES.items():
        for name in names:
            try:
                entry=fetch_file(study,name,output,timeout=timeout)
                print(f"NASA VERIFIED DOWNLOAD: {study} / {name} ({entry['bytes']} bytes)")
            except Exception as exc:
                entry={
                    'study':study,'file':name,'status':'NOT_DOWNLOADED',
                    'request_url':url_for(study,name),
                    'error_type':type(exc).__name__,
                    'error':str(exc)[:500],
                }
                print(f"FAILED NASA DOWNLOAD: {study} / {name} ({entry['error_type']})")
            entries.append(entry)
    report={
        'retrieval_source':'NASA OSDR HTTPS ONLY',
        'mirror_fallback_allowed':False,
        'downloaded':sum(x['status']=='DOWNLOADED_FROM_NASA_OSDR' for x in entries),
        'failed':sum(x['status']=='NOT_DOWNLOADED' for x in entries),
        'requested':len(entries),'files':entries,
        'note':'Download and file-structure checks do not establish clinical validity, time-series alignment or suitability for 17-channel model training.',
    }
    output.mkdir(parents=True,exist_ok=True)
    (output/'official_source_manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--output',type=Path,default=ROOT/'data/external/nasa_osdr')
    p.add_argument('--timeout',type=float,default=40)
    args=p.parse_args()
    report=download(args.output,args.timeout)
    print(json.dumps({'downloaded':report['downloaded'],
                      'failed':report['failed'],
                      'manifest':str(args.output/'official_source_manifest.json')},indent=2))
    if report['failed']:
        raise SystemExit(1)


if __name__=='__main__':
    main()
