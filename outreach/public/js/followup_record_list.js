frappe.listview_settings["Followup Record"] = {
    onload(listview) {
        const user = frappe.session.user;
        const roles = frappe.user_roles || [];

        const is_coordinator =
            roles.includes("Outreach Coordinator") || roles.includes("System Manager");

        // For volunteers, lock filter: caller = me
        if (!is_coordinator) {
            listview.filter_area.add(
                [["Followup Record", "caller", "=", user]],
                true // locked
            );
        }

        // Optional quick buttons (for everyone)
        listview.page.add_inner_button(__("My Followups Today"), () => {
            listview.filter_area.clear();
            listview.filter_area.add([
                ["Followup Record", "caller", "=", user],
            ], true);
            listview.filter_area.add([
                ["Followup Record", "modified", ">=", frappe.datetime.get_today()],
            ]);
            listview.refresh();
        });

        listview.page.add_inner_button(__("Pending Calls"), () => {
            listview.filter_area.clear();
            listview.filter_area.add([
                ["Followup Record", "caller", "=", user],
            ], true);
            listview.filter_area.add([
                ["Followup Record", "call_status", "=", "To Be Called"],
            ]);
            listview.refresh();
        });
    },

    // Status pill colour in the list
    get_indicator(doc) {
        if (doc.call_status === "Available") {
            return [__("Available"), "blue", "call_status,=,Available"];
        }
        if (doc.call_status === "Attended") {
            return [__("Attended"), "green", "call_status,=,Attended"];
        }
        if (doc.call_status === "Partially Attended") {
            return [__("Partial"), "yellow", "call_status,=,Partially Attended"];
        }
        if (doc.call_status === "Not Available") {
            return [__("Not Available"), "orange", "call_status,=,Not Available"];
        }
        if (doc.call_status === "Didn't Pick" || doc.call_status === "Wrong Number") {
            return [__(doc.call_status), "red", `call_status,=,${doc.call_status}`];
        }
        return [__(doc.call_status || "Unknown"), "gray", `call_status,=,${doc.call_status}`];
    },
};
