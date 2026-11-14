"""Retrieve only NASA-managed original OSDR CSV files from the public AWS bucket.

The AWS S3 bucket nasa-osdr is maintained by NASA and supports anonymous
download. All file names are discovered by listing the corresponding study
prefix, never guessed. No GitHub mirror or synthetic data is allowed.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
BUCKET='nasa-osdr'
STUDIES=('OSD-569','OSD-575')


def run_aws(*args: str, timeout: int=120) -> str:
    proc=subprocess.run(['aws',*args,'--no-sign-request','--region','us-west-2'],
                        capture_output=True,text=True,timeout=timeout,check=False)
    if proc.returncode:
        raise RuntimeError((proc.stderr or proc.stdout).strip()[:450])
    return proc.stdout


def discover(study: str) -> list[dict]:
    if study not in STUDIES:
        raise ValueError('Unexpected study identifier')
    listing=run_aws('s3','ls',f's3://{BUCKET}/{study}/','--recursive')
    files=[]
    for line in listing.splitlines():
        fields=line.split(maxsplit=3)
        if len(fields)!=4:continue
        filename=fields[3].split('/')[-1]
        upper=filename.upper()
        if not filename.lower().endswith('.csv') or 'TRANSFORMED' not in upper:
            continue
        if study=='OSD-569' and not any(x in upper for x in ('CBC','BLOOD_COUNT')):
            continue
        if study=='OSD-575' and not any(x in upper for x in ('CMP','METABOLIC','MULTIPLEX','ALAMAR')):
            continue
        files.append({'study':study,'filename':filename,'s3_key':fields[3],
                      'size_reported_bytes':int(fields[2]),
                      'source':f's3://{BUCKET}/{fields[3]}'})
    return sorted(files,key=lambda x:x['s3_key'])


def validate_csv(blob: bytes, study: str) -> dict:
    try: content=blob.decode('utf-8-sig')
    except UnicodeDecodeError as exc:raise ValueError('Non-UTF8 source CSV') from exc
    reader=csv.reader(io.StringIO(content))
    header=next(reader,None)
    if not header or len(header)<3:
        raise ValueError('Missing CSV header')
    n=0; inconsistent=0
    for row in reader:
        if not row:continue
        n+=1
        if len(row)!=len(header):
            inconsistent+=1
    if not n:raise ValueError('No CSV records')
    if study=='OSD-569' and 'Sample Name' not in header:
        raise ValueError('OSD-569 source CBC schema mismatch')
    return {'header_columns':len(header),'data_rows':n,
            'inconsistent_width_rows':inconsistent}


def download(output: Path) -> dict:
    output.mkdir(parents=True,exist_ok=True)
    discovery=[]; entries=[]
    for study in STUDIES:
        try:
            matching=discover(study)
            discovery.append({'study':study,'status':'DISCOVERED',
                              'matching_files':len(matching)})
        except Exception as exc:
            discovery.append({'study':study,'status':'DISCOVERY_FAILED',
                              'error_type':type(exc).__name__,
                              'error':str(exc)[:500]})
            continue
        for item in matching:
            destination=output/study/item['filename']
            destination.parent.mkdir(parents=True,exist_ok=True)
            try:
                run_aws('s3','cp',item['source'],str(destination),timeout=120)
                blob=destination.read_bytes()
                check=validate_csv(blob,study)
                entries.append({**item,'status':'DOWNLOADED_NASA_S3_ORIGINAL',
                                'downloaded_utc':datetime.now(timezone.utc).isoformat(),
                                'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),
                                'csv_structure':check})
            except Exception as exc:
                destination.unlink(missing_ok=True)
                entries.append({**item,'status':'DOWNLOAD_OR_CHECK_FAILED',
                                'error_type':type(exc).__name__,
                                'error':str(exc)[:500]})
    failed=sum(x['status']!='DOWNLOADED_NASA_S3_ORIGINAL' for x in entries)
    failed+=sum(x['status']!='DISCOVERED' or x['matching_files']==0
                for x in discovery)
    result={'source':'NASA_MANAGED_PUBLIC_AWS_S3_BUCKET_nasa-osdr',
            'official_reference':'https://www.nasa.gov/reference/osdr-help-getting-started-with-aws-and-osdr-data/',
            'discovery':discovery,'files':entries,
            'downloaded':sum(x['status']=='DOWNLOADED_NASA_S3_ORIGINAL' for x in entries),
            'failed':failed,'mirror_fallback_allowed':False,
            'note':'Original data do not provide a synchronized continuous 17-channel astronaut dataset.'}
    (output/'official_source_manifest.json').write_text(
        json.dumps(result,indent=2)+'\n',encoding='utf-8')
    for item in discovery:
        print('DISCOVERY',json.dumps(item),flush=True)
    for item in entries:
        print('SOURCE',json.dumps({k:item.get(k) for k in (
            'study','filename','status','bytes','error_type','error')}),flush=True)
    return result


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--output',type=Path,default=ROOT/'data/external/nasa_osdr')
    args=p.parse_args()
    report=download(args.output)
    print(json.dumps({'downloaded':report['downloaded'],'failed':report['failed'],
                       'manifest':str(args.output/'official_source_manifest.json')},indent=2))
    if report['failed']:
        raise SystemExit(1)


if __name__=='__main__':
    main()
