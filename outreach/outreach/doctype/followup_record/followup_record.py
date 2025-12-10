import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class FollowupRecord(Document):
    def validate(self):
        # keep your existing validations
        self._validate_session_slot_future()
        self._validate_session_slot_stack_consistency()
        self._validate_call_status_against_session()

    def on_update(self):
        """
        Update Student summary fields whenever this followup is saved.
        This will be triggered both from normal form saves and from
        API updates (e.g., followup_dashboard / quick-edit).
        """
        self._update_student_summary()

    def _validate_session_slot_future(self):
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

        if session_stack and slot_stack and slot_stack != session_stack:
            frappe.throw(
                "Selected Session Slot does not belong to this Followup Session's Session Stack."
            )

    def _validate_call_status_against_session(self):
        if not self.followup_session or not self.call_status:
            return

        session = frappe.get_doc("Followup Session", self.followup_session)
        valid_statuses = [
            row.option_label
            for row in (session.status_options or [])
            if row.option_label
        ]

        if valid_statuses and self.call_status not in valid_statuses:
            frappe.throw(
                f"Invalid status '{self.call_status}' for this Followup Session. "
                f"Allowed values: {', '.join(valid_statuses)}"
            )

    def _update_student_summary(self):
        """Push call + attendance summary onto Student."""
        if not self.student:
            return

        now_ts = now_datetime()

        # 1) Any update to this followup counts as a "call made"
        #    (you can tighten this if you only want certain statuses)
        try:
            frappe.db.set_value("Student", self.student, "last_call_made_at", now_ts)
        except Exception:
            frappe.log_error(
                f"Failed to update last_call_made_at for Student {self.student}",
                "FollowupRecord._update_student_summary",
            )

        # 2) If this log indicates attendance, update last_session + last_session_attended_at
        if self.call_status in ("Attended", "Partially Attended"):
            session_stack = None

            # Prefer stack from Followup Session
            if self.followup_session:
                session_stack = frappe.db.get_value(
                    "Followup Session",
                    self.followup_session,
                    "session_stack",
                )

            # Fallback to stack from Session Slot if needed
            if not session_stack and self.session_slot:
                session_stack = frappe.db.get_value(
                    "Session Slot",
                    self.session_slot,
                    "session_stack",
                )

            if session_stack:
                try:
                    frappe.db.set_value(
                        "Student",
                        self.student,
                        {
                            "last_attended_session": session_stack,
                            "last_session_attended_at": now_ts,
                        },
                    )
                except Exception:
                    frappe.log_error(
                        f"Failed to update last_session for Student {self.student}",
                        "FollowupRecord._update_student_summary",
                    )
