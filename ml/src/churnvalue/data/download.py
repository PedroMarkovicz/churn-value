"""Download the UCI archive with checksum verification and convert it to Parquet."""

from __future__ import annotations

import hashlib
import shutil
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

XLSX_NAME = "online_retail_II.xlsx"
# Description holds a few numeric cells; forcing str keeps the column Arrow-serialisable.
RAW_DTYPES = {"Invoice": str, "StockCode": str, "Description": str, "Country": str}


class ChecksumError(RuntimeError):
    """Raised when a downloaded file does not match the pinned SHA-256."""


def sha256_of(path: Path, chunk_size: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_verified(url: str, dest: Path, expected_sha256: str) -> Path:
    if dest.exists() and sha256_of(dest) == expected_sha256:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url) as response, partial.open("wb") as out:
        shutil.copyfileobj(response, out)
    actual = sha256_of(partial)
    if actual != expected_sha256:
        partial.unlink()
        raise ChecksumError(f"SHA-256 mismatch for {url}: expected {expected_sha256}, got {actual}")
    partial.replace(dest)
    return dest


def xlsx_zip_to_parquet(zip_path: Path, out_path: Path) -> Path:
    with zipfile.ZipFile(zip_path) as archive, archive.open(XLSX_NAME) as fh:
        sheets = pd.read_excel(fh, sheet_name=None, dtype=RAW_DTYPES)
    raw = pd.concat(sheets.values(), ignore_index=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    raw.to_parquet(out_path, index=False)
    return out_path
