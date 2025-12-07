import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class FollowupRecord(Document):
    def validate(self):
        # if you already have validate_status / validate_project_alignment, keep them:
        # self.validate_status()
        # self.validate_project_alignment()

        self._validate_session_slot_future()
        self._validate_session_slot_stack_consistency()

    def _validate_session_slot_future(self):
        """Ensure selected session_slot (if any) points to a future slot."""
        if not self.session_slot:
            return

        slot = frappe.db.get_value(
            "Session Slot",
            self.session_slot,
            ["date_and_time"],
            as_dict=True,
        )
        if not slot:
            frappe.throw(f"Session Slot {self.session_slot} not found.")

        if slot.date_and_time and slot.date_and_time <= now_datetime():
            frappe.throw("Cannot select a Session Slot whose time is already in the past.")

    def _validate_session_slot_stack_consistency(self):
        """
        Ensure that the selected session_slot belongs to the same Session Stack
        as the Followup Session, if both are present.
        """
        if not self.session_slot or not self.followup_session:
            return

        slot = frappe.db.get_value(
            "Session Slot",
            self.session_slot,
            ["session_stack"],
            as_dict=True,
        )
        if not slot:
            frappe.throw(f"Session Slot {self.session_slot} not found.")

        session = frappe.db.get_value(
            "Followup Session",
            self.followup_session,
            ["session_stack"],
            as_dict=True,
        )
        if not session:
            frappe.throw(f"Followup Session {self.followup_session} not found.")

        slot_stack = slot.session_stack
        session_stack = session.session_stack

        # If parent session has a stack defined, enforce equality
        if session_stack and slot_stack and slot_stack != session_stack:
            frappe.throw(
                "Selected Session Slot does not belong to this Followup Session's Session Stack."
            )