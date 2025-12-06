import frappe
from frappe.utils import now, get_datetime

@frappe.whitelist()
def get_slots_for_stack(stack):
    """Return active future slots under a given Session Stack (structured list)."""
    if not stack:
        return []

    current = now()
    slots = frappe.get_all(
        "Session Slot",
        filters=[
            ["session_stack", "=", stack],
            ["date_and_time", ">", current]
        ],
        fields=["name", "date_and_time"],
        order_by="date_and_time asc",
        limit_page_length=200,
    )

    # Return structured objects the frontend expects
    return [
        {
            "name": s.get("name"),
            "value": s.get("name"),
            "label": f"{s.get('name')} — {s.get('date_and_time')}",
            "date_and_time": s.get("date_and_time"),
        }
        for s in slots
    ]


@frappe.whitelist()
def get_followup_records(volunteer=None, followup_session=None, session_stack=None, status=None, limit=200, start=0):
    """
    Return followup records for a volunteer or organizer view.
    Minimal changes to keep original semantics but compatible with v15.
    """
    user = frappe.session.user
    roles = frappe.get_roles(user) or []
    is_coordinator = "Outreach Coordinator" in roles or "System Manager" in roles

    if volunteer is None and not is_coordinator:
        volunteer = user

    conditions = [["docstatus", "=", 0]]

    if volunteer:
        conditions.append(["assigned_to", "=", volunteer])

    if followup_session:
        conditions.append(["followup_session", "=", followup_session])

    if session_stack:
        conditions.append(["session_stack", "=", session_stack])

    if status:
        conditions.append(["call_status", "=", status])

    # v15 expects limit_start / limit_page_length
    try:
        limit_page_length = int(limit)
    except Exception:
        limit_page_length = 200
    try:
        limit_start = int(start)
    except Exception:
        limit_start = 0

    records = frappe.get_all(
        "Followup Record",
        filters=conditions,
        fields=[
            "name",
            "student",
            "assigned_to",
            "call_status",
            "remarks",
            "followup_session",
            "modified as last_updated",
        ],
        limit_start=limit_start,
        limit_page_length=limit_page_length,
        order_by="last_updated desc"
    )

    # fetch student display data in batch
    student_names = [r.get("student") for r in records if r.get("student")]
    students = {}
    if student_names:
        for s in frappe.get_all("Student", filters=[["name", "in", student_names]], fields=["name", "student_name", "phone", "last_session"]):
            students[s.get("name")] = s

    # fetch slot labels for preferred slots in batch (use preferred_session_slot)
    slot_names = list({r.get("preferred_session_slot") for r in records if r.get("preferred_session_slot")})
    slots = {}
    if slot_names:
        for s in frappe.get_all("Session Slot", filters=[["name", "in", slot_names]], fields=["name", "date_and_time"]):
            slots[s.get("name")] = s

    # assemble response (expose session_slot for frontend but read/write maps to preferred_session_slot)
    out = []
    for r in records:
        student = students.get(r.get("student")) or {}
        slot = slots.get(r.get("preferred_session_slot")) or {}
        effective_session_stack = slot.get("session_stack")

        out.append({
            "record_name": r.get("name"),
            "student_name": student.get("student_name"),
            "student": r.get("student"),
            "phone": student.get("phone"),
            "followup_session": r.get("followup_session"),
            "session_stack": effective_session_stack,
            "session_slot": r.get("preferred_session_slot"),                      # frontend uses this
            "session_slot_label": f"{slot.get('name') or ''} — {slot.get('date_and_time') or ''}" if slot else "",
            "assigned_to": r.get("assigned_to"),
            "call_status": r.get("call_status"),
            "remarks": r.get("remarks"),
            "last_updated": r.get("last_updated"),
            "last_contacted": r.get("last_contacted")
        })

    return {"records": out, "count": len(out)}
    

@frappe.whitelist()
def update_followup_record(record_name, field, value):
    """
    Update a single field on Followup Record.
    Accepts frontend 'session_slot' (mapped to preferred_session_slot).
    """
    if not frappe.db.exists("Followup Record", record_name):
        frappe.throw("Followup Record not found")

    doc = frappe.get_doc("Followup Record", record_name)

    # permission: volunteer may only update records assigned to them unless coordinator
    user = frappe.session.user
    roles = frappe.get_roles(user) or []
    is_coordinator = "Outreach Coordinator" in roles or "System Manager" in roles

    if not is_coordinator and doc.assigned_to and doc.assigned_to != user:
        frappe.throw("You are not permitted to update this record.")

    # Map frontend field names to actual DocType fieldnames
    field_map = {
        "session_slot": "preferred_session_slot",
        "preferred_session_slot": "preferred_session_slot",
        "remarks": "remarks",
        "call_status": "call_status"
    }

    if field not in field_map:
        frappe.throw("Field not allowed to update")

    target_field = field_map[field]
    setattr(doc, target_field, value or None)

    # update last_contacted on every change
    doc.last_contacted = now()
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    # propagate attendance to Student.last_session when appropriate
    if target_field == "call_status" and value in ["Attended", "Partially Attended"]:
        try:
            followup_session = frappe.get_doc("Followup Session", doc.followup_session)
            session_stack = followup_session.session_stack
            if session_stack:
                frappe.db.set_value("Student", doc.student, "last_session", session_stack)
        except Exception:
            frappe.log_error(f"Failed to update Student.last_session for {doc.student}", "followup_dashboard.update_followup_record")

    return {"status": "ok", "record": record_name, "field": target_field, "value": value}