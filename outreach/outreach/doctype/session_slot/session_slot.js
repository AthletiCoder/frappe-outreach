// public/js/session_slot.js
frappe.ui.form.on("Session Slot", {
    refresh(frm) {
        if (!frm.doc.__islocal) {
            frm.add_custom_button(__("Mark Attendance"), () => {
                // Route to Followup Record list, filtered for this slot
                frappe.route_options = {
                    session_slot: frm.doc.name,
                };
                frappe.set_route("List", "Followup Record", "List");
            }, __("Actions"));
        }
    },
});