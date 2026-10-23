"""Acquire the official challenge archive and rebuild the application data.

Usage: python scripts/setup_data.py [--archive /path/to/official.zip]
Dataset files remain local and are not committed to GitHub.
"""
import argparse
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

URL = 'https://startech.s3.ir-central1.arvanstorage.ir/starcoach-dataset-v16-cap300-csv.zip?versionId='
ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {'products.csv', 'shops.csv', 'offers.csv'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='Use an existing official ZIP instead of downloading')
    args = parser.parse_args()
    local = ROOT / '.data'
    local.mkdir(exist_ok=True)
    archive = args.archive.resolve() if args.archive else local / 'official-v16.zip'
    if not args.archive:
        partial = archive.with_suffix('.zip.part')
        print('Downloading the official challenge dataset...', flush=True)
        try:
            with urllib.request.urlopen(URL, timeout=60) as response, partial.open('wb') as dest:
                shutil.copyfileobj(response, dest)
            partial.replace(archive)
        except Exception as exc:
            print(f'Download failed: {exc}\nDownload the official ZIP in your browser, then run:\n'
                  'python scripts/setup_data.py --archive /path/to/official.zip', file=sys.stderr)
            return 1
    if not archive.is_file():
        print('Archive does not exist.', file=sys.stderr)
        return 1
    extracted = local / 'csv'
    extracted.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        members = {}
        for member in bundle.infolist():
            name = Path(member.filename).name
            if name in REQUIRED and not member.is_dir():
                if name in members:
                    raise ValueError('Duplicate required CSV in archive: ' + name)
                members[name] = member
        if set(members) != REQUIRED:
            raise ValueError('Archive must contain products.csv, shops.csv and offers.csv')
        # Extract only the expected basenames; do not trust archive paths.
        for name, member in members.items():
            with bundle.open(member) as source, (extracted / name).open('wb') as dest:
                shutil.copyfileobj(source, dest)
    subprocess.run([sys.executable, str(ROOT / 'scripts/import_dataset.py'), str(extracted)], check=True)
    subprocess.run([sys.executable, str(ROOT / 'scripts/verify_data.py')], check=True)
    print('Dataset ready. Run npm start.', flush=True)
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
