import frappe
from frappe.model.document import Document

class FollowupSession(Document):
    def validate(self):
        if not self.status_options:
            frappe.throw("At least one status option is required.")
        if self.deadline and self.deadline < frappe.utils.today():
            frappe.throw("Deadline cannot be in the past.")