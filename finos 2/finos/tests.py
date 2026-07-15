# ─────────────────────────────────────────────────────────────────────────────
# finos/tests.py — Test Suite (FIN-OS Core Server)
# ─────────────────────────────────────────────────────────────────────────────
# Django's testing framework builds on Python's built-in unittest module.
# Tests live here by convention, though you can split them into a tests/ package.
#
# RUN TESTS:
#   python manage.py test finos        ← Run all tests in the finos app
#   python manage.py test              ← Run all tests in the entire project
#   python manage.py test finos.tests.LandingPageTests  ← Run a specific class
#
# HOW DJANGO TESTS WORK:
#   - Django creates a TEMPORARY test database (prefixed with 'test_')
#   - Each TestCase class is isolated — DB is reset between classes
#   - TestClient simulates browser requests without starting a real server
#   - After all tests run, the test database is destroyed
#
# TESTS TO ADD FOR FINOS APP:
#
#   class LandingPageTests(TestCase):
#
#       def test_landing_page_loads(self):
#           """The home page should return HTTP 200."""
#           client = Client()
#           response = client.get('/')
#           self.assertEqual(response.status_code, 200)
#
#       def test_landing_uses_correct_template(self):
#           """Django should render landing.html for the root URL."""
#           client = Client()
#           response = client.get('/')
#           self.assertTemplateUsed(response, 'finos/landing.html')
#
#       def test_investor_page_loads(self):
#           """The investor dashboard should return HTTP 200."""
#           client = Client()
#           response = client.get('/investor/')
#           self.assertEqual(response.status_code, 200)
#
#       def test_trader_page_loads(self):
#           response = Client().get('/trader/')
#           self.assertEqual(response.status_code, 200)
#
#       def test_unknown_url_returns_404(self):
#           response = Client().get('/nonexistent/')
#           self.assertEqual(response.status_code, 404)
# ─────────────────────────────────────────────────────────────────────────────

# TestCase is Django's enhanced version of Python's unittest.TestCase.
# It wraps each test method in a database transaction that is rolled back
# after the test, so tests don't pollute each other's data.
from django.test import TestCase

# Create your tests here.
