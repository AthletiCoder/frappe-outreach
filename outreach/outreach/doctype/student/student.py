import frappe
from frappe.model.document import Document
from frappe import _

class Student(Document):
    def validate(self):
        self.validate_unique_phone_in_project()

    def validate_unique_phone_in_project(self):
        if not self.phone or not self.outreach_project:
            return

        existing = frappe.db.exists(
            "Student",
            {
                "phone": self.phone,
                "outreach_project": self.outreach_project,
                "name": ["!=", self.name]
            }
        )

        if existing:
            frappe.throw(
                _("Phone {0} already exists for another student in project {1}").format(
                    self.phone, self.outreach_project
                )
            )