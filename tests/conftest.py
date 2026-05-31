"""
Shared pytest configuration and fixtures.
"""
import sys
import os

# Ensure the project root is on the path for all tests
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
