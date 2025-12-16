import frappe
from collections import defaultdict

ATTENDED_STATUSES = ("Attended", "Partially Attended")


def execute(filters=None):
    filters = frappe._dict(filters or {})

    # 1) Fetch attendance facts
    rows = frappe.db.sql(
        """
        SELECT
            st.mentor AS mentor,
            fs.session_stack AS stack,
            fr.student AS student
        FROM `tabFollowup Record` fr
        JOIN `tabFollowup Session` fs ON fs.name = fr.followup_session
        JOIN `tabStudent` st ON st.name = fr.student
        WHERE fr.call_status IN ('Attended', 'Partially Attended')
          AND st.mentor IS NOT NULL
          AND fs.session_stack IS NOT NULL
        """,
        as_dict=True,
    )

    if not rows:
        columns = [
            {"fieldname": "mentor", "label": "Mentor", "fieldtype": "Link", "options": "User", "width": 200}
        ]
        return columns, []

    # 2) Collect stacks
    stacks = sorted({r["stack"] for r in rows})

    # 3) mentor → stack → set(student)
    matrix = defaultdict(lambda: defaultdict(set))
    for r in rows:
        matrix[r["mentor"]][r["stack"]].add(r["student"])

    # 4) Build columns
    columns = [
        {
            "fieldname": "mentor",
            "label": "Mentor",
            "fieldtype": "Link",
            "options": "User",
            "width": 200,
        }
    ]
    for stack in stacks:
        columns.append({
            "fieldname": f"stack_{frappe.scrub(stack)}",
            "label": stack,
            "fieldtype": "Int",
            "width": 120,
        })

    columns.append({
        "fieldname": "total",
        "label": "Total",
        "fieldtype": "Int",
        "width": 100,
    })

    # 5) Build data rows
    data = []
    for mentor, stack_map in matrix.items():
        row = {"mentor": mentor}
        total = 0
        for stack in stacks:
            count = len(stack_map.get(stack, []))
            row[f"stack_{frappe.scrub(stack)}"] = count
            total += count
        row["total"] = total
        data.append(row)

    return columns, data