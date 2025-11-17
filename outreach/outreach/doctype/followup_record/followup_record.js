frappe.ui.form.on('Followup Record', {
  followup_session: function(frm) {
    if (!frm.doc.followup_session) return;
    frappe.db.get_doc('Followup Session', frm.doc.followup_session).then(doc => {
      const opts = (doc.status_options || []).map(o => o.option_label);
      frm.set_df_property('call_status', 'options', opts.join('\n'));
    });
  }
});