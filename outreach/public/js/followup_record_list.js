frappe.listview_settings["Followup Record"] = {
    // Make sure we have the fields we need in each row's 'doc'
    add_fields: ["student", "followup_session", "session_slot", "call_status", "remarks", "last_contacted"],

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

        // Optional quick buttons (for everyone)
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

        // Delegated click handler for "Log" buttons in rows
        $(listview.wrapper).on("click", ".btn-followup-log", function (e) {
            e.stopPropagation(); // don’t open the document
            const name = $(this).data("name");
            open_followup_log_dialog(name);
        });
    },

    // Status pill colour in the list
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
        for (let status in color_map) {
            if (doc.call_status === status) {
                return [__(status), color_map[status], `call_status,=,${status}`];
            }
        }
    },

    // Inject "Log" button into a convenient column (e.g., student)
    formatters: {
        // Adjust "student" to whichever column you prefer to host the button
        student(value, df, doc) {
            const label = value || doc.student || __("Student");
            const safe_label = frappe.utils.escape_html(label);

            const btn_html =
                `<button class="btn btn-xs btn-default btn-followup-log" ` +
                `data-name="${doc.name}" style="margin-right:4px;">` +
                `${__("Log")}</button>`;

            return `${btn_html}${safe_label}`;
        },
    },
};


// ------------- Helper: Log dialog ----------------

function open_followup_log_dialog(name) {
    // 1) Load Followup Record
    frappe.db.get_doc("Followup Record", name).then(rec => {
        if (!rec.student) {
            frappe.msgprint(__("No student linked with this followup record."));
            return;
        }

        // 2) Load Student + Followup Session in parallel
        const student_p = frappe.db.get_value("Student", rec.student, ["student_name", "phone"]);
        const session_p = rec.followup_session
            ? frappe.db.get_doc("Followup Session", rec.followup_session)
            : Promise.resolve(null);

        Promise.all([student_p, session_p]).then(results => {
            const student_res = results[0];
            const session_doc = results[1];

            const student_name = student_res.message && student_res.message.student_name;
            const phone = student_res.message && student_res.message.phone;
            const digits = phone ? phone.replace(/\D/g, "") : "";
            const tel_link = digits ? `tel:${digits}` : "#";

            const wa_text = `Hi ${student_name || ""}, this is ${frappe.session.user_fullname || frappe.session.user} from Outreach.`;
            const wa_url = digits
                ? `https://wa.me/${digits}?text=${encodeURIComponent(wa_text)}`
                : "#";

            // Build call_status options from Followup Session.status_options
            let status_options = [];
            if (session_doc && Array.isArray(session_doc.status_options)) {
                status_options = session_doc.status_options
                    .map(row => row.option_label)
                    .filter(Boolean);
            }

            // Fields for the dialog
            const fields = [
                {
                    fieldtype: "HTML",
                    fieldname: "contact_html",
                },
                {
                    fieldtype: "Section Break",
                    label: __("Quick Update"),
                },
                {
                    label: __("Preferred Slot"),
                    fieldname: "session_slot",
                    fieldtype: "Link",
                    options: "Session Slot",
                    default: rec.session_slot || null,
                },
                {
                    label: __("Call Status"),
                    fieldname: "call_status",
                    fieldtype: "Select",
                    options: status_options.join("\n"),
                    default: rec.call_status || "",
                },
                {
                    label: __("Remarks"),
                    fieldname: "remarks",
                    fieldtype: "Small Text",
                    default: rec.remarks || "",
                },
                {
                    fieldtype: "Section Break",
                },
                {
                    fieldtype: "HTML",
                    fieldname: "last_log_html",
                },
            ];

            const d = new frappe.ui.Dialog({
                title: __("Log Followup"),
                fields: fields,
                primary_action_label: __("Save"),
                primary_action(values) {
                    // queue updates
                    const updates = [];

                    if (values.session_slot !== rec.session_slot) {
                        updates.push({ fieldname: "session_slot", value: values.session_slot || null });
                    }
                    if (values.call_status !== rec.call_status) {
                        updates.push({ fieldname: "call_status", value: values.call_status || "" });
                    }
                    if (values.remarks !== rec.remarks) {
                        updates.push({ fieldname: "remarks", value: values.remarks || "" });
                    }

                    if (!updates.length) {
                        d.hide();
                        return;
                    }

                    // apply updates sequentially using frappe.client.set_value
                    const applyUpdate = (idx) => {
                        if (idx >= updates.length) {
                            frappe.show_alert({ message: __("Saved"), indicator: "green" });
                            d.hide();
                            // refresh listview so row reflects latest status
                            frappe.listview.refresh("Followup Record");
                            return;
                        }
                        const u = updates[idx];
                        frappe.call({
                            method: "frappe.client.set_value",
                            args: {
                                doctype: "Followup Record",
                                name: rec.name,
                                fieldname: u.fieldname,
                                value: u.value,
                            },
                            callback: () => applyUpdate(idx + 1),
                        });
                    };

                    applyUpdate(0);
                },
            });

            // Fill contact_html
            let contact_html = `<div style="margin-bottom:8px;">`;
            contact_html += `<div><strong>${__("Student")}:</strong> ${frappe.utils.escape_html(student_name || rec.student || "")}</div>`;
            if (phone) {
                contact_html += `<div><strong>${__("Phone")}:</strong> ${frappe.utils.escape_html(phone)}</div>`;
            }
            contact_html += `<div style="margin-top:6px; display:flex; gap:8px;">`;
            if (digits) {
                contact_html += `<a class="btn btn-xs btn-default" href="${tel_link}">
                                   <i class="fa fa-phone"></i> ${__("Call")}
                                 </a>`;
                contact_html += `<a class="btn btn-xs btn-default" href="${wa_url}" target="_blank">
                                   <i class="fa fa-whatsapp"></i> ${__("WhatsApp")}
                                 </a>`;
            } else {
                contact_html += `<span class="text-muted">${__("No phone number available")}</span>`;
            }
            contact_html += `<a class="btn btn-xs btn-link" 
                                href="#Form/Followup Record/${encodeURIComponent(rec.name)}" 
                                target="_blank"
                                style="margin-left:auto;">
                                ${__("Open Full Log")}
                             </a>`;
            contact_html += `</div></div>`;

            d.fields_dict.contact_html.$wrapper.html(contact_html);

            // Fill last_log_html with most recent info
            const last_ts = rec.last_contacted || rec.modified;
            let last_html = `<div class="text-muted">`;
            last_html += `<div><strong>${__("Last Status")}:</strong> ${frappe.utils.escape_html(rec.call_status || "")}</div>`;
            if (rec.remarks) {
                last_html += `<div><strong>${__("Last Remarks")}:</strong> ${frappe.utils.escape_html(rec.remarks)}</div>`;
            }
            if (last_ts) {
                last_html += `<div><strong>${__("Last Contacted/Updated")}:</strong> ${frappe.utils.escape_html(last_ts)}</div>`;
            }
            last_html += `</div>`;

            d.fields_dict.last_log_html.$wrapper.html(last_html);

            // Set dynamic query for session_slot based on session_stack from Followup Session
            if (session_doc && session_doc.session_stack) {
                const stack = session_doc.session_stack;
                const slot_control = d.fields_dict.session_slot;
                if (slot_control && slot_control.get_query) {
                    slot_control.get_query = function () {
                        return {
                            filters: {
                                session_stack: stack,
                                date_and_time: [">", frappe.datetime.now_datetime()],
                            },
                        };
                    };
                }
            }

            d.show();
        });
    });
}