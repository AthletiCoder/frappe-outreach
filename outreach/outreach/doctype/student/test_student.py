import frappe
import unittest

class TestStudent(unittest.TestCase):
    def test_create_student(self):
        student = frappe.get_doc({
            "doctype": "Student",
            "first_name": "Arjun",
            "last_name": "Sharma",
            "email": "arjun.sharma@example.com"
        })
        student.insert()
        self.assertEqual(student.first_name, "Arjun")