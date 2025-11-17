import frappe
import json
from frappe.utils import now, get_datetime

@frappe.whitelist()
def get_active_followup_sessions():
    """Return active Followup Sessions (deadline in the future) with details."""
    current = get_datetime(now())
    sessions = frappe.get_all(
        "Followup Session",
        filters=[["deadline", ">", current]],
        fields=["name", "session_stack", "deadline"],
        order_by="deadline asc"
    )

    # Return readable options for dropdown
    return [
        {
            "label": f"{s.name} — {s.session_stack} (Deadline: {s.deadline})",
            "value": s.name,
            "session_stack": s.session_stack,
            "deadline": s.deadline
        }
        for s in sessions
    ]

@frappe.whitelist()
def assign_students_to_followup(students, followup_session, volunteer):
    """Assign selected students to an existing Followup Session."""
    if isinstance(students, str):
        students = json.loads(students)
    if "—" in followup_session:
        followup_session = followup_session.split("—")[0].strip()
    session_stack = frappe.db.get_value("Followup Session", followup_session, "session_stack")
    if not session_stack:
        frappe.throw("Invalid Followup Session selected.")

    created = []
    for student in students:
        exists = frappe.db.exists(
            "Followup Record",
            {"student": student, "followup_session": followup_session},
        )
        if exists:
            continue

        doc = frappe.new_doc("Followup Record")
        doc.student = student
        doc.followup_session = followup_session
        doc.session_stack = session_stack
        doc.assigned_to = volunteer
        doc.call_status = "To Be Called"
        doc.insert(ignore_permissions=True)
        created.append(doc.name)

    frappe.db.commit()
    return {"created": created, "count": len(created)}