frappe.ui.form.on("Followup Session", {
    onload(frm) {
        // Only prefill for brand new docs with no options yet
        if (!frm.is_new()) return;
        if (frm.doc.status_options && frm.doc.status_options.length) return;

        const defaults = [
            "Available",
            "Will Try",
            "Not Available",
            "Didn't Pick",
            "Attended",
            "Flunked",
            "Partially Attended",
        ];

        defaults.forEach(label => {
            const row = frm.add_child("status_options");
            row.option_label = label;
        });

        frm.refresh_field("status_options");
    },
});