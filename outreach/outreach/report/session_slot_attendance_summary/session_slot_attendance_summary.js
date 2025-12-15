frappe.query_reports["Session Slot Attendance Summary"] = {
    filters: [
        { fieldname: "outreach_project", label: "Project", fieldtype: "Link", options: "Outreach Project" },
        { fieldname: "from_date", label: "From", fieldtype: "Date" },
        { fieldname: "to_date", label: "To", fieldtype: "Date" }
    ]
};