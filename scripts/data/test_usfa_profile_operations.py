"""Regression check for the shipped, state-bound USFA operating data."""

from pathlib import Path
import subprocess
import sys
import unittest


class UsfaProfileOperationsTest(unittest.TestCase):
    def test_published_operations_reproduce_from_retained_native_records(self):
        script = Path(__file__).with_name("build_usfa_profile_operations.py")
        result = subprocess.run([sys.executable, str(script), "--verify"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
