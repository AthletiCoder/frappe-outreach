frappe.ui.form.on("Followup Record", {
    refresh(frm) {
        set_call_status_options(frm);

        // Add Call & WhatsApp buttons
        if (frm.doc.student) {
            frappe.db.get_value("Student", frm.doc.student, ["phone", "student_name"])
                .then(r => {
                    const phone = (r.message && r.message.phone) || "";
                    const student_name = (r.message && r.message.student_name) || "";

                    if (phone) {
                        const digits = phone.replace(/\D/g, "");
                        const tel = `tel:${digits}`;
                        const wa_text = `Hi ${student_name}, this is ${frappe.session.user_fullname || frappe.session.user} from Outreach. We are inviting you for ${frm.doc.followup_session || ""}.`;
                        const wa_url = `https://wa.me/${digits}?text=${encodeURIComponent(wa_text)}`;

                        frm.add_custom_button(__("Call"), () => {
                            window.location.href = tel;
                        }, __("Contact"));

                        frm.add_custom_button(__("WhatsApp"), () => {
                            window.open(wa_url, "_blank");
                        }, __("Contact"));
                    }
                });
        }

        // Dynamic filter for Preferred Session Slot
        frm.set_query("preferred_session_slot", function () {
            // First preference: session_stack already known on this document
            let stack = frm.doc.session_stack;

            // Fallback: derive from Followup Session (if needed)
            if (!stack && frm.doc.followup_session) {
                // We can't synchronously fetch here, so we assume session_stack is already
                // stored on Followup Record OR set via another hook.
            }

            const filters = {
                date_and_time: [">", frappe.datetime.now_datetime()],
            };
            if (stack) {
                filters["session_stack"] = stack;
            }

            return {
                filters: filters,
            };
        });
    },
    followup_session(frm) {
        // when parent session changes, reload options and clear invalid value
        set_call_status_options(frm, true);
    },

    // When preferred_session_slot changes, derive and set session_stack from the slot
    preferred_session_slot: function (frm) {
        if (!frm.doc.preferred_session_slot) {
            return;
        }
        frappe.db.get_value("Session Slot", frm.doc.preferred_session_slot, ["session_stack"])
            .then(r => {
                const stack = r.message && r.message.session_stack;
                if (stack && frm.doc.session_stack !== stack) {
                    frm.set_value("session_stack", stack);
                }
            });
    },
});

function set_call_status_options(frm, reset_if_invalid = false) {
    // no parent session → no options
    if (!frm.doc.followup_session) {
        frm.set_df_property("call_status", "options", []);
        if (reset_if_invalid && frm.doc.call_status) {
            frm.set_value("call_status", "");
        }
        return;
    }

    frappe.db.get_doc("Followup Session", frm.doc.followup_session)
        .then(doc => {
            // doc.status_options is the child table with "option_label"
            const opts = (doc.status_options || [])
                .map(row => row.option_label)
                .filter(Boolean);

            // prepend an empty option so user can clear
            const options_string = [""]  // first blank
                .concat(opts)
                .join("\n");

            frm.set_df_property("call_status", "options", options_string);

            // if current value is not in list, optionally reset
            if (reset_if_invalid && frm.doc.call_status && !opts.includes(frm.doc.call_status)) {
                frm.set_value("call_status", "");
            }
        })
        .catch(err => {
            console.error("Failed to load status options", err);
        });
}