import hashlib
import zipfile
from pathlib import Path

import pandas as pd
import pytest

from churnvalue.data.download import (
    XLSX_NAME,
    ChecksumError,
    download_verified,
    sha256_of,
    xlsx_zip_to_parquet,
)


def test_sha256_of_matches_hashlib(tmp_path: Path):
    path = tmp_path / "f.bin"
    path.write_bytes(b"churn" * 1000)
    assert sha256_of(path) == hashlib.sha256(b"churn" * 1000).hexdigest()


def test_download_verified_copies_file_with_matching_hash(tmp_path: Path):
    source = tmp_path / "source.zip"
    source.write_bytes(b"payload")
    dest = tmp_path / "raw" / "data.zip"
    result = download_verified(source.as_uri(), dest, hashlib.sha256(b"payload").hexdigest())
    assert result == dest
    assert dest.read_bytes() == b"payload"


def test_download_verified_rejects_wrong_hash_and_leaves_nothing(tmp_path: Path):
    source = tmp_path / "source.zip"
    source.write_bytes(b"tampered")
    dest = tmp_path / "raw" / "data.zip"
    with pytest.raises(ChecksumError):
        download_verified(source.as_uri(), dest, "0" * 64)
    assert not dest.exists()
    assert not dest.with_suffix(".zip.part").exists()


def test_download_verified_skips_network_when_file_is_valid(tmp_path: Path):
    dest = tmp_path / "data.zip"
    dest.write_bytes(b"cached")
    missing_url = (tmp_path / "does-not-exist.zip").as_uri()
    assert download_verified(missing_url, dest, hashlib.sha256(b"cached").hexdigest()) == dest


def test_xlsx_zip_to_parquet_concatenates_sheets_and_stringifies_description(tmp_path: Path):
    xlsx = tmp_path / XLSX_NAME
    sheet = pd.DataFrame(
        {
            "Invoice": ["489434", "C489435"],
            "StockCode": ["85048", "21232"],
            "Description": [12345, "CANDLE"],  # mixed types, as in the real file
            "Quantity": [1, -1],
            "InvoiceDate": pd.to_datetime(["2009-12-01 07:45", "2009-12-01 08:00"]),
            "Price": [6.95, 1.25],
            "Customer ID": [13085.0, 13085.0],
            "Country": ["United Kingdom", "United Kingdom"],
        }
    )
    with pd.ExcelWriter(xlsx) as writer:
        sheet.to_excel(writer, sheet_name="Year 2009-2010", index=False)
        sheet.to_excel(writer, sheet_name="Year 2010-2011", index=False)
    archive = tmp_path / "archive.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.write(xlsx, arcname=XLSX_NAME)

    out = xlsx_zip_to_parquet(archive, tmp_path / "interim" / "raw.parquet")
    raw = pd.read_parquet(out)
    assert len(raw) == 4
    assert raw["Description"].tolist()[0] == "12345"
    assert raw["Invoice"].tolist()[1] == "C489435"
