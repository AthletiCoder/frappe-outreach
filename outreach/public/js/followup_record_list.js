frappe.listview_settings["Followup Record"] = {
    add_fields: [
        "student",
        "call_status",
        "followup_session",
        "session_slot",
        "remarks",
        "last_contacted",
    ],

    onload(listview) {
        const user = frappe.session.user;
        const roles = frappe.user_roles || [];

        const is_coordinator =
            roles.includes("Outreach Coordinator") || roles.includes("System Manager");

        // For volunteers, lock filter: caller = me
        if (!is_coordinator) {
            listview.filter_area.add(
                [[listview.doctype, "caller", "=", user]],
                true // locked
            );
        }

        // Quick filter: My Followups Today
        listview.page.add_inner_button(__("My Followups Today"), () => {
            listview.filter_area.clear();
            listview.filter_area.add(
                [[listview.doctype, "caller", "=", user]],
                true
            );
            listview.filter_area.add([
                [listview.doctype, "modified", ">=", frappe.datetime.get_today()],
            ]);
            listview.refresh();
        });

        // Quick filter: Pending Calls
        listview.page.add_inner_button(__("Pending Calls"), () => {
            listview.filter_area.clear();
            listview.filter_area.add(
                [[listview.doctype, "caller", "=", user]],
                true
            );
            listview.filter_area.add([
                [listview.doctype, "call_status", "=", "To Be Called"],
            ]);
            listview.refresh();
        });
    },

    get_indicator(doc) {
        const color_map = {
            "Available": "blue",
            "Attended": "green",
            "Sent": "green",
            "Partially Attended": "yellow",
            "Not Available": "orange",
            "Didn't Pick": "red",
            "Wrong Number": "red",
        };
        if (doc.call_status && color_map[doc.call_status]) {
            return [__(doc.call_status), color_map[doc.call_status], `call_status,=,${doc.call_status}`];
        }
        return [__(doc.call_status || "Unknown"), "gray", `call_status,=,${doc.call_status}`];
    },
};