frappe.query_reports["Student Attendance"] = {
    filters: [
        {
            fieldname: "session_stacks",
            label: __("Session Stacks"),
            fieldtype: "MultiSelectList",
            options: "Session Stack",
            reqd: 1,
            get_data: function (txt) {
                return frappe.db.get_link_options("Session Stack", txt);
            },
        },
    ],

    onload: function (report) {
        report.page.add_inner_button(__("Assign Followup"), function () {
            // IMPORTANT: read rows at click-time, not onload
            const rows = (typeof report.get_data === "function")
                ? report.get_data()
                : (report.data || []);

            const student_names = Array.from(
                new Set(
                    (rows || [])
                        .map((row) => row.student)
                        .filter((s) => !!s)
                )
            );

            if (!student_names.length) {
                frappe.msgprint(__("No students in current result to assign."));
                return;
            }

            // Dialog: same UX as Student List "Assign to Followup"
            let d = new frappe.ui.Dialog({
                title: __("Assign These Students to Followup"),
                fields: [
                    {
                        label: "Followup Session",
                        fieldname: "followup_session",
                        fieldtype: "Select",
                        reqd: 1,
                        options: [],
                        onchange: function () {
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
                        label: "Caller",
                        fieldname: "caller",
                        fieldtype: "Link",
                        options: "User",
                        reqd: 1,
                    },
                ],
                primary_action_label: __("Assign"),
                primary_action(values) {
                    if (!values.followup_session || !values.caller) {
                        frappe.msgprint(__("Followup Session and Caller are required."));
                        return;
                    }

                    frappe.call({
                        method: "outreach.api.followup_assignment.assign_students_to_followup",
                        args: {
                            students: student_names,
                            followup_session: values.followup_session,
                            caller: values.caller,
                        },
                        freeze: true,
                        freeze_message: __("Creating Followup Records..."),
                        callback: (r) => {
                            if (!r.exc) {
                                frappe.msgprint(
                                    __(
                                        "Created {0} Followup Records successfully.",
                                        [r.message && r.message.count || student_names.length]
                                    )
                                );
                                d.hide();
                            }
                        },
                    });
                },
            });

            // Load active followup sessions (reuse same API as Student List)
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