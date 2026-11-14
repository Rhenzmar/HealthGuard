"""Download NASA OSDR primary source files, discovered from NASA's own file API.

python -m tools.download_official_nasa_osdr
Only nasa.gov file metadata/remote_url is trusted. No mirror, no guessed filenames,
no synthetic fallback. Manifest records HTTP provenance, SHA256, and failures.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parent.parent
HOST='https://osdr.nasa.gov'
STUDIES=('OSD-569','OSD-575')


def nasa_request(url: str, timeout: float) -> bytes:
    if urlparse(url).netloc!='osdr.nasa.gov' or not url.startswith(HOST+'/'):
        raise ValueError('Only HTTPS URLs on osdr.nasa.gov are allowed')
    with urlopen(Request(url, headers={'User-Agent':'HealthGuard-OSDR-SourceVerification/1.1'}),
                 timeout=timeout) as response:
        resolved=response.geturl()
        if urlparse(resolved).netloc!='osdr.nasa.gov':
            raise ValueError('External redirect refused')
        blob=response.read(80_000_001)
    if len(blob)>80_000_000:
        raise ValueError('NASA response exceeds source-file size limit')
    return blob


def discover(study: str, timeout: float = 40) -> list[dict]:
    if study not in STUDIES:
        raise ValueError('Unexpected study identifier')
    study_number=study.split('-')[1]
    url=f'{HOST}/osdr/data/osd/files/{study_number}'
    raw=json.loads(nasa_request(url,timeout))
    files=[]
    # NASA's official Data File API returns JSON with a study_files mapping.
    def walk(node):
        if isinstance(node,dict):
            if 'remote_url' in node and isinstance(node['remote_url'],str):
                files.append(node)
            for value in node.values():
                if isinstance(value,(dict,list)):
                    walk(value)
        elif isinstance(node,list):
            for value in node:
                walk(value)
    walk(raw)
    seen=set(); results=[]
    for item in files:
        remote=item['remote_url']
        if not remote.startswith('/geode-py/ws/studies/'+study+'/download?'):
            continue
        # Restrict to original, explicitly NASA-listed transformed data CSVs.
        from urllib.parse import parse_qs
        params=parse_qs(urlparse(remote).query)
        filename=params.get('file',[''])[0]
        upper=filename.upper()
        if not filename.lower().endswith('.csv') or 'TRANSFORMED' not in upper:
            continue
        if study=='OSD-569' and 'BLOOD_COUNT' not in upper and 'CBC' not in upper:
            continue
        if study=='OSD-575' and not any(x in upper for x in ('METABOLIC','CMP','MULTIPLEX','ALAMAR')):
            continue
        if filename not in seen:
            seen.add(filename)
            results.append({'study':study,'filename':filename,'url':HOST+remote})
    return sorted(results,key=lambda x:x['filename'])


def validate_csv(blob: bytes, study: str, filename: str) -> dict:
    content=blob.decode('utf-8-sig')
    if content.lstrip().startswith(('<html','<!DOCTYPE','{')):
        raise ValueError('Downloaded content is not CSV')
    reader=csv.reader(io.StringIO(content))
    header=next(reader,None)
    if not header or len(header)<3:
        raise ValueError('Missing CSV header')
    count=0; width_issue=0
    for row in reader:
        if not row:continue
        count+=1
        if len(row)!=len(header):
            width_issue+=1
    if not count:
        raise ValueError('No source observations')
    if study=='OSD-569' and 'Sample Name' not in header:
        raise ValueError('OSD-569 CBC schema does not contain Sample Name')
    return {'columns':len(header),'rows':count,'inconsistent_row_widths':width_issue}


def download(output: Path, timeout: float=40) -> dict:
    output.mkdir(parents=True,exist_ok=True)
    entries=[]; discovery=[]
    for study in STUDIES:
        try:
            candidates=discover(study,timeout)
            discovery.append({'study':study,'status':'DISCOVERED','matching_files':len(candidates)})
        except Exception as exc:
            discovery.append({'study':study,'status':'DISCOVERY_FAILED',
                              'error_type':type(exc).__name__,'error':str(exc)[:300]})
            continue
        for candidate in candidates:
            try:
                blob=nasa_request(candidate['url'],timeout)
                structure=validate_csv(blob,study,candidate['filename'])
                dest=output/study/candidate['filename']
                dest.parent.mkdir(parents=True,exist_ok=True)
                dest.write_bytes(blob)
                entries.append({**candidate,'status':'DOWNLOADED_FROM_NASA_OSDR',
                                'sha256':hashlib.sha256(blob).hexdigest(),
                                'bytes':len(blob),'csv':structure,
                                'downloaded_utc':datetime.now(timezone.utc).isoformat()})
            except Exception as exc:
                entries.append({**candidate,'status':'DOWNLOAD_OR_VALIDATION_FAILED',
                                'error_type':type(exc).__name__,'error':str(exc)[:300]})
    failures=sum(x['status']!='DOWNLOADED_FROM_NASA_OSDR' for x in entries)
    failures+=sum(x['status']!='DISCOVERED' for x in discovery)
    failures+=sum(x['status']=='DISCOVERED' and x['matching_files']==0 for x in discovery)
    report={'source':'OFFICIAL_NASA_OSDR_FILE_API_ONLY',
            'discovery':discovery,'files':entries,
            'downloaded':sum(x['status']=='DOWNLOADED_FROM_NASA_OSDR' for x in entries),
            'failures':failures,'mirror_fallback_allowed':False,
            'note':'Original file acquisition and schema verification do not prove 17 synchronous channels or clinical validity.'}
    (output/'official_source_manifest.json').write_text(
        json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=ROOT/'data/external/nasa_osdr')
    parser.add_argument('--timeout',type=float,default=40)
    args=parser.parse_args()
    report=download(args.output,args.timeout)
    print(json.dumps({'downloaded':report['downloaded'],
                      'failures':report['failures'],
                      'manifest':str(args.output/'official_source_manifest.json')},indent=2))
    if report['failures']:
        raise SystemExit(1)

if __name__=='__main__':
    main()
