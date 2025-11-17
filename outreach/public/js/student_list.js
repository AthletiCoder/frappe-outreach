frappe.listview_settings["Student"] = {
    onload(listview) {
        listview.page.add_action_item(__("Assign to Followup"), () => {
            const selected = listview.get_checked_items();
            if (!selected.length) {
                frappe.msgprint("Select at least one student first.");
                return;
            }

            let d = new frappe.ui.Dialog({
                title: "Assign Selected Students to Followup",
                fields: [
                    {
                        label: "Followup Session",
                        fieldname: "followup_session",
                        fieldtype: "Select",
                        reqd: 1,
                        options: [],
                        onchange: function() {
                            const selected_session = d.get_value("followup_session");
                            const session_data = d.sessionMap[selected_session];
                            if (session_data) {
                                d.set_value("session_stack", session_data.session_stack);
                                d.set_value("deadline", session_data.deadline);
                            }
                        },
                    },
                    {
                        label: "Session Stack",
                        fieldname: "session_stack",
                        fieldtype: "Data",
                        read_only: 1,
                    },
                    {
                        label: "Deadline",
                        fieldname: "deadline",
                        fieldtype: "Datetime",
                        read_only: 1,
                    },
                    {
                        label: "Volunteer",
                        fieldname: "volunteer",
                        fieldtype: "Link",
                        options: "User",
                        reqd: 1,
                    },
                ],
                primary_action_label: "Assign",
                primary_action(values) {
                    frappe.call({
                        method: "outreach.api.followup_assignment.assign_students_to_followup",
                        args: {
                            students: selected.map((s) => s.name),
                            followup_session: values.followup_session,
                            volunteer: values.volunteer,
                        },
                        callback: (r) => {
                            if (!r.exc) {
                                frappe.msgprint(
                                    `Created ${r.message.count} Followup Records successfully.`
                                );
                                d.hide();
                                listview.refresh();
                            }
                        },
                    });
                },
            });

            // Load active followup sessions
            frappe.call({
                method: "outreach.api.followup_assignment.get_active_followup_sessions",
                callback: (r) => {
                    const sessions = r.message || [];
                    d.sessionMap = {};
                    d.set_df_property(
                        "followup_session",
                        "options",
                        sessions.map((s) => s.label).join("\n")
                    );
                    sessions.forEach((s) => {
                        d.sessionMap[s.label] = s;
                    });
                },
            });

            d.show();
        });
    },
};
