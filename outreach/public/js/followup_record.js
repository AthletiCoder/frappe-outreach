frappe.ui.form.on("Followup Record", {
    refresh(frm) {
        // 1) Dynamic call_status options from Followup Session
        set_call_status_options(frm);

        // 2) Cache session_stack from Followup Session (for slot filtering)
        cache_session_stack_from_session(frm);

        // 3) Dynamic filter for Session Slot
        set_session_slot_query(frm);

        // 4) Add Call & WhatsApp buttons
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
    },

    followup_session(frm) {
        // When parent session changes:
        // 1) reload status options
        set_call_status_options(frm, true);

        // 2) refresh cached stack + slot filter
        cache_session_stack_from_session(frm, true);
        set_session_slot_query(frm);

        // 3) clear selected slot (so volunteer re-chooses a valid one)
        frm.set_value("session_slot", null);
    },

    // If you want to do something when session_slot changes later, you can add:
    // session_slot(frm) { ... }
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

/**
 * Cache session_stack from Followup Session into frm._session_stack_for_filter
 * (since there is no session_stack field on Followup Record).
 */
function cache_session_stack_from_session(frm, log_error) {
    const session = frm.doc.followup_session;
    if (!session) {
        frm._session_stack_for_filter = null;
        return;
    }

    frappe.db
        .get_value("Followup Session", session, ["session_stack"])
        .then(r => {
            const stack = r.message && r.message.session_stack;
            frm._session_stack_for_filter = stack || null;
        })
        .catch(err => {
            if (log_error) {
                console.error("Failed to fetch session_stack from Followup Session", err);
            }
            frm._session_stack_for_filter = null;
        });
}

/**
 * Filter session_slot to:
 *   - only future slots (date_and_time > now)
 *   - and, if we know the parent session_stack, only those slots in that stack
 */
function set_session_slot_query(frm) {
    frm.set_query("session_slot", function () {
        const filters = {
            date_and_time: [">", frappe.datetime.now_datetime()],
        };

        // use cached stack from Followup Session if available
        if (frm._session_stack_for_filter) {
            filters["session_stack"] = frm._session_stack_for_filter;
        }

        return { filters };
    });
}