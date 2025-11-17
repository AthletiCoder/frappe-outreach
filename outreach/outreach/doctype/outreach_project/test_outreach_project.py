import frappe
import unittest

class TestOutreachProject(unittest.TestCase):
    def test_create_project(self):
        project = frappe.get_doc({
            "doctype": "Outreach Project",
            "project_name": "IIT Hyderabad 2025",
            "start_date": "2025-10-01",
            "end_date": "2025-12-31"
        })
        project.insert()
        self.assertEqual(project.project_name, "IIT Hyderabad 2025")
