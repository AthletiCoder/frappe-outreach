import frappe
from frappe.utils import now

@frappe.whitelist()
def get_slots_for_stack(stack):
    """Return active slots under a given Session Stack."""
    slots = frappe.get_all(
        "Session Slot",
        filters={"session_stack": stack},
        pluck="name",
        order_by="creation desc",
    )
    return slots

@frappe.whitelist()
def get_followup_records(volunteer=None, followup_session=None, session_stack=None, status=None, limit=200, start=0):
    """
    Return followup records for a volunteer or organizer view.
    - volunteer: user id to restrict to assigned_to (if None and caller is volunteer, restrict to frappe.session.user)
    - followup_session / session_stack: optional filters
    - status: optional filter on call_status
    """
    user = frappe.session.user
    # permissions: volunteers should only see their records unless user has Coordinator role
    is_coordinator = frappe.has_permission("Followup Session", ptype="read", user=user) and frappe.get_roles(user) and ("Outreach Coordinator" in frappe.get_roles(user) or "System Manager" in frappe.get_roles(user))

    print(is_coordinator)

    if volunteer is None and not is_coordinator:
        volunteer = user

    conditions = [["Followup Record", "docstatus", "=", 0]]

    if volunteer:
        conditions.append(["Followup Record", "assigned_to", "=", volunteer])

    if followup_session:
        conditions.append(["Followup Record", "followup_session", "=", followup_session])

    if session_stack:
        conditions.append(["Followup Record", "session_stack", "=", session_stack])

    if status:
        conditions.append(["Followup Record", "call_status", "=", status])

    records = frappe.get_all(
        "Followup Record",
        filters=conditions,
        fields=[
            "name",
            "student",
            "assigned_to",
            "call_status",
            "remarks",
            "session_slot",
            "followup_session",
            "session_stack",
            "modified as last_updated",
        ],
        limit_page_length=limit,
        offset=start,
        order_by="last_updated desc"
    )

    # fetch student display data in batch
    student_names = [r.student for r in records if r.student]
    students = {}
    if student_names:
        for s in frappe.get_all("Student", filters=[["name", "in", student_names]], fields=["name", "student_name", "phone", "last_session"]):
            students[s.name] = s

    # fetch slot labels for preferred slots in batch
    slot_names = list(set([r.preferred_session_slot for r in records if r.preferred_session_slot]))
    slots = {}
    if slot_names:
        for s in frappe.get_all("Session Slot", filters=[["name", "in", slot_names]], fields=["name", "date_and_time"]):
            slots[s.name] = s

    # assemble response
    out = []
    for r in records:
        student = students.get(r.student) or {}
        slot = slots.get(r.preferred_session_slot) or {}
        out.append({
            "record_name": r.name,
            "student_name": student.get("student_name"),
            "student": r.student,
            "phone": student.get("phone"),
            "followup_session": r.followup_session,
            "session_stack": r.session_stack,
            "session_slot": r.session_slot,
            "session_slot_label": f"{slot.get('name') or ''} — {slot.get('date_and_time') or ''}" if slot else "",
            "assigned_to": r.assigned_to,
            "call_status": r.call_status,
            "remarks": r.remarks,
            "last_updated": r.last_updated
        })

    return {"records": out, "count": len(out)}


@frappe.whitelist()
def update_followup_record(record_name, field, value):
    """
    Update a single field on Followup Record.
    Automatically update last_contacted when relevant fields change.
    """
    if not frappe.db.exists("Followup Record", record_name):
        frappe.throw("Followup Record not found")

    doc = frappe.get_doc("Followup Record", record_name)

    # permission: volunteer may only update records assigned to them unless coordinator
    user = frappe.session.user
    roles = frappe.get_roles(user)
    is_coordinator = "Coordinator" in roles or "System Manager" in roles

    if not is_coordinator and doc.assigned_to and doc.assigned_to != user:
        frappe.throw("You are not permitted to update this record.")

    # allowed fields to update
    allowed = {"call_status", "remarks", "preferred_session_slot"}
    if field not in allowed:
        frappe.throw("Field not allowed to update")

    # set value
    setattr(doc, field, value)

    # update last_contacted on status/remarks/slot change
    doc.last_contacted = now()
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    # if call_status indicates attended/partial, update Student.last_session (reuse existing logic)
    if field == "call_status" and value in ["Attended", "Partially Attended"]:
        try:
            followup_session = frappe.get_doc("Followup Session", doc.followup_session)
            session_stack = followup_session.session_stack
            if session_stack:
                frappe.db.set_value("Student", doc.student, "last_session", session_stack)
        except Exception:
            frappe.log_error(f"Failed to update Student.last_session for {doc.student}", "followup_dashboard.update_followup_record")

    return {"status": "ok", "record": record_name, "field": field, "value": value}