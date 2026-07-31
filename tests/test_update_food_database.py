import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import requests

from scripts.update_food_database import download_or_keep_last_verified


class DownloadFallbackTests(unittest.TestCase):
    @patch("scripts.update_food_database.download_latest")
    def test_keeps_last_verified_source_when_remote_tls_fails(self, download):
        download.side_effect = requests.exceptions.SSLError("TLS closed")
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "food.xlsx"
            source.write_bytes(b"last-known-good")
            self.assertFalse(download_or_keep_last_verified(source))
            self.assertEqual(source.read_bytes(), b"last-known-good")

    @patch("scripts.update_food_database.download_latest")
    def test_fails_when_no_verified_fallback_exists(self, download):
        download.side_effect = requests.exceptions.SSLError("TLS closed")
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(requests.exceptions.SSLError):
                download_or_keep_last_verified(Path(folder) / "missing.xlsx")


if __name__ == "__main__":
    unittest.main()
