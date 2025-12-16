import frappe

ATTENDED_STATUSES = ("Attended", "Partially Attended")


def execute(filters=None):
    filters = frappe._dict(filters or {})

    stacks = filters.get("session_stacks") or []
    if isinstance(stacks, str):
        stacks = [s.strip() for s in stacks.split(",") if s.strip()]

    # Base columns
    base_columns = [
        {
            "fieldname": "student",
            "label": "Student",
            "fieldtype": "Link",
            "options": "Student",
            "width": 180,
        },
        {
            "fieldname": "mentor",
            "label": "Mentor",
            "fieldtype": "Link",
            "options": "User",
            "width": 180,
        },
    ]

    if not stacks:
        return base_columns, []

    # 1) Students (mentor comes from Student)
    students = frappe.get_all(
        "Student",
        fields=["name", "mentor"],
        order_by="name asc",
    )

    # 2) Dynamic stack columns
    columns = list(base_columns)
    for stack in stacks:
        columns.append({
            "fieldname": f"stack_{frappe.scrub(stack)}",
            "label": stack,
            "fieldtype": "Data",
            "width": 70,
        })

    # 3) Followup Sessions → stack mapping
    sessions = frappe.get_all(
        "Followup Session",
        filters={"session_stack": ["in", stacks]},
        fields=["name", "session_stack"],
    )
    if not sessions:
        return columns, [
            {"student": s["name"], "mentor": s["mentor"]}
            for s in students
        ]

    session_stack_map = {s["name"]: s["session_stack"] for s in sessions}
    session_names = list(session_stack_map.keys())

    # 4) Attendance from Followup Record
    attendance_rows = frappe.get_all(
        "Followup Record",
        filters={
            "followup_session": ["in", session_names],
            "call_status": ["in", ATTENDED_STATUSES],
        },
        fields=["student", "followup_session"],
    )

    present = set()
    for row in attendance_rows:
        student = row.get("student")
        session = row.get("followup_session")
        if student and session in session_stack_map:
            present.add((student, session_stack_map[session]))

    # 5) Build data
    data = []
    for s in students:
        row = {
            "student": s["name"],
            "mentor": s.get("mentor"),
        }
        for stack in stacks:
            key = (s["name"], stack)
            row[f"stack_{frappe.scrub(stack)}"] = "P" if key in present else ""
        data.append(row)

    return columns, data