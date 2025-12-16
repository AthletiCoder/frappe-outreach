import frappe

def execute(filters=None):
    filters = frappe._dict(filters or {})
    project = filters.get("outreach_project")

    project_filter = "AND ss.outreach_project = %(project)s" if project else ""
    params = {"project": project} if project else {}

    rows = frappe.db.sql(f"""
        SELECT ss.session_stack AS stack,
               ss.speaker AS mentor,
               SUM(fr.call_status IN ('Attended','Partially Attended')) AS attended,
               COUNT(*) AS total_invited
        FROM `tabFollowup Record` fr
        LEFT JOIN `tabSession Slot` ss ON ss.name = fr.session_slot
        WHERE fr.docstatus = 0
        {project_filter}
        GROUP BY ss.session_stack, ss.speaker
        ORDER BY attended DESC
    """, params, as_dict=True)

    columns = [
        {"fieldname":"stack","label":"Session Stack","fieldtype":"Link","options":"Session Stack","width":220},
        {"fieldname":"mentor","label":"Mentor","fieldtype":"Link","options":"User","width":200},
        {"fieldname":"attended","label":"Attended Count","fieldtype":"Int","width":140},
        {"fieldname":"total_invited","label":"Invited","fieldtype":"Int","width":100},
    ]
    return columns, rows