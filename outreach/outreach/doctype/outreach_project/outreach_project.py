import frappe
from frappe.model.document import Document

class OutreachProject(Document):
    def validate(self):
        # Ensure participant phones are unique within this project
        phones = [p.student_phone for p in self.participants]
        if len(phones) != len(set(phones)):
            frappe.throw("Duplicate phone found in project participants")