import frappe

ATTENDED_STATUSES = ("Attended", "Partially Attended")


def execute(filters=None):
    filters = frappe._dict(filters or {})

    # Expect session_stacks as a comma-separated string or list
    stacks = filters.get("session_stacks") or []
    if isinstance(stacks, str):
        stacks = [s.strip() for s in stacks.split(",") if s.strip()]

    # Base columns (always present)
    base_columns = [
        {
            "fieldname": "student",
            "label": "Student",
            "fieldtype": "Link",
            "options": "Student",
            "width": 180,
        },
        {
            "fieldname": "student_name",
            "label": "Student Name",
            "fieldtype": "Data",
            "width": 200,
        },
    ]

    if not stacks:
        # no stacks selected -> only show basic student info, no attendance grid
        return base_columns, []

    # 1) get students in scope (you can add more filters later: project, year, etc.)
    students = frappe.get_all(
        "Student",
        fields=["name", "student_name"],
        order_by="student_name asc",
    )

    # 2) build dynamic columns: one per requested Session Stack
    columns = list(base_columns)
    for stack in stacks:
        columns.append({
            "fieldname": f"stack_{stack}",
            "label": stack,
            "fieldtype": "Data",
            "width": 70,
        })

    # 3) find Followup Sessions whose session_stack is in the selected stacks
    sessions = frappe.get_all(
        "Followup Session",
        filters={"session_stack": ["in", stacks]},
        fields=["name", "session_stack"],
    )
    if not sessions:
        # no sessions → no attendance
        return columns, [
            {"student": s["name"], "student_name": s["student_name"]}
            for s in students
        ]

    # map session_name -> session_stack
    session_stack_map = {s["name"]: s["session_stack"] for s in sessions}
    session_names = list(session_stack_map.keys())

    # 4) fetch attendance in bulk from Followup Record using followup_session
    attendance_rows = frappe.get_all(
        "Followup Record",
        filters={
            "followup_session": ["in", session_names],
            "call_status": ["in", ATTENDED_STATUSES],
        },
        fields=["student", "followup_session"],
    )

    # build set of (student, session_stack) that are present
    present = set()
    for row in attendance_rows:
        student = row.get("student")
        session_name = row.get("followup_session")
        if not student or not session_name:
            continue
        stack = session_stack_map.get(session_name)
        if not stack:
            continue
        present.add((student, stack))

    # 5) build data rows
    data = []
    for s in students:
        row = {
            "student": s["name"],
            "student_name": s["student_name"],
        }
        for stack in stacks:
            key = (s["name"], stack)
            row[f"stack_{stack}"] = "P" if key in present else ""
        data.append(row)

    return columns, data