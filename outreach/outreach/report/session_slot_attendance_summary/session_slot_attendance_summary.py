import frappe

def execute(filters=None):
    filters = frappe._dict(filters or {})
    project = filters.get("outreach_project")

    slots = frappe.get_all(
        "Session Slot",
        filters=[["outreach_project", "=", project]] if project else [],
        fields=["name", "date_and_time", "session_stack"],
        order_by="date_and_time desc",
        limit_page_length=1000,
    )

    if not slots:
        columns = [
            {"fieldname": "slot", "label": "Slot", "fieldtype": "Link", "options": "Session Slot", "width": 200},
            {"fieldname": "datetime", "label": "Date/Time", "fieldtype": "Datetime", "width": 150},
            {"fieldname": "session_stack", "label": "Stack", "fieldtype": "Link", "options": "Session Stack", "width": 200},
            {"fieldname": "attended", "label": "Attended", "fieldtype": "Int", "width": 100},
            {"fieldname": "flunked", "label": "Flunked", "fieldtype": "Int", "width": 100},
        ]
        return columns, []

    slot_names = [s.name for s in slots]
    slot_tuple = tuple(slot_names) if len(slot_names) > 1 else (slot_names[0],)

    rows = frappe.db.sql(
        """
        SELECT
            fr.session_slot AS slot,
            SUM(CASE WHEN fr.call_status IN ('Attended','Partially Attended') THEN 1 ELSE 0 END) AS attended,
            SUM(CASE WHEN fr.call_status = 'Flunked' THEN 1 ELSE 0 END) AS flunked
        FROM `tabFollowup Record` fr
        WHERE fr.session_slot IN %(slots)s
        GROUP BY fr.session_slot
        """,
        {"slots": slot_tuple},
        as_dict=True,
    )

    counts = {r["slot"]: r for r in rows}

    data = []
    for s in slots:
        c = counts.get(s.name) or {"attended": 0, "flunked": 0}
        data.append({
            "slot": s.name,
            "datetime": s.date_and_time,
            "session_stack": s.session_stack,
            "attended": int(c["attended"] or 0),
            "flunked": int(c["flunked"] or 0),
        })

    columns = [
        {"fieldname": "slot", "label": "Slot", "fieldtype": "Link", "options": "Session Slot", "width": 220},
        {"fieldname": "datetime", "label": "Date/Time", "fieldtype": "Datetime", "width": 170},
        {"fieldname": "session_stack", "label": "Stack", "fieldtype": "Link", "options": "Session Stack", "width": 200},
        {"fieldname": "attended", "label": "Attended", "fieldtype": "Int", "width": 100},
        {"fieldname": "flunked", "label": "Flunked", "fieldtype": "Int", "width": 100},
    ]

    return columns, data