frappe.pages['followup-dashboard'] = frappe.pages['followup-dashboard'] || {};
frappe.pages['followup-dashboard'].on_page_load = function (wrapper) {
    console.log("✅ followup_dashboard.js loaded"); // confirm load

    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Followup Dashboard',
        single_column: true,
    });

    // always append content to page.main (exists because html file exists)
    const $filters = $(`
        <div class="row mb-3">
            <div class="col-md-3">
                <input type="text" id="f_volunteer" class="form-control" placeholder="Volunteer (User)">
            </div>
            <div class="col-md-3">
                <input type="text" id="f_followup_session" class="form-control" placeholder="Followup Session">
            </div>
            <div class="col-md-2">
                <select id="f_status" class="form-control">
                    <option value="">All Status</option>
                    <option>To Be Called</option>
                    <option>Connected</option>
                    <option>Attended</option>
                    <option>Partially Attended</option>
                    <option>No Response</option>
                    <option>Wrong Number</option>
                </select>
            </div>
            <div class="col-md-3">
                <button id="f_apply" class="btn btn-primary me-2">Apply</button>
                <button id="f_reset" class="btn btn-secondary">Reset</button>
            </div>
        </div>
        <hr/>
    `);

    const $table_wrapper = $('<div class="table-area"></div>');

    $(page.main).append($filters).append($table_wrapper);

    function renderSlotOptions(selected_slot, session_stack) {
        const cache = window.__followup_dashboard_slots || {};
        const options = cache[session_stack] || [];
        return ['<option value="">(No preference)</option>']
            .concat(
                options.map(o => {
                    const val = o.name;
                    const label = `${o.name} — ${o.date_and_time || ''}`;
                    return `<option value="${val}" ${val === selected_slot ? 'selected' : ''}>${label}</option>`;
                })
            )
            .join('');
    }

    function render_table(data) {
        const cols = [
            'Student',
            'Phone',
            'Followup Session',
            'Preferred Slot',
            'Call Status',
            'Remarks',
            'Last Contacted',
            'Actions',
        ];
        let html = `<table class="table table-bordered table-condensed">
            <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>`;

        data.forEach(row => {
            html += `<tr data-record="${row.record_name}">
                <td>${row.student_name || row.student}</td>
                <td>${row.phone || ''}</td>
                <td>${row.followup_session}</td>
                <td>
                    <select class="preferred-slot form-control">${renderSlotOptions(
                        row.session_slot,
                        row.session_stack
                    )}</select>
                </td>
                <td>
                    <select class="call-status form-control">
                        ${[
                            'To Be Called',
                            'Connected',
                            'Attended',
                            'Partially Attended',
                            'No Response',
                            'Wrong Number',
                            'Follow-up Needed',
                        ]
                            .map(
                                s =>
                                    `<option ${
                                        s === row.call_status ? 'selected' : ''
                                    }>${s}</option>`
                            )
                            .join('')}
                    </select>
                </td>
                <td><input class="remarks form-control" value="${(
                    row.remarks || ''
                ).replace(/"/g, '&quot;')}" /></td>
                <td>${row.last_contacted || ''}</td>
                <td><button class="btn btn-sm btn-primary save-row">Save</button></td>
            </tr>`;
        });

        html += '</tbody></table>';
        $table_wrapper.html(html);

        // attach save handlers
        $table_wrapper.find('.save-row').on('click', async function () {
            const $tr = $(this).closest('tr');
            const record = $tr.data('record');
            const new_status = $tr.find('.call-status').val();
            const new_remarks = $tr.find('.remarks').val();
            const new_slot = $tr.find('.preferred-slot').val() || '';

            const update = async (field, value) =>
                frappe.call({
                    method: 'outreach.api.followup_dashboard.update_followup_record',
                    args: { record_name: record, field, value },
                });

            await update('session_slot', new_slot);
            await update('remarks', new_remarks);
            await update('call_status', new_status);
            frappe.show_alert({ message: 'Saved successfully', indicator: 'green' });
            load_table();
        });
    }

    async function load_slots_for_stack(stack) {
        return new Promise(resolve => {
            if (!stack) return resolve([]);
            window.__followup_dashboard_slots = window.__followup_dashboard_slots || {};
            if (window.__followup_dashboard_slots[stack])
                return resolve(window.__followup_dashboard_slots[stack]);

            frappe.call({
                method: 'outreach.api.followup_dashboard.get_slots_for_stack',
                args: { stack },
                callback: r => {
                    const items = r.message || [];
                    window.__followup_dashboard_slots[stack] = items;
                    resolve(items);
                },
            });
        });
    }

    async function load_table() {
        $table_wrapper.html('<p class="text-muted">Loading...</p>');
        const args = {
            volunteer: $('#f_volunteer').val() || null,
            followup_session: $('#f_followup_session').val() || null,
            status: $('#f_status').val() || null,
        };

        frappe.call({
            method: 'outreach.api.followup_dashboard.get_followup_records',
            args,
            callback: async r => {
                const data = (r.message || {}).records || [];
                const stacks = Array.from(
                    new Set(data.map(d => d.session_stack).filter(Boolean))
                );
                await Promise.all(stacks.map(s => load_slots_for_stack(s)));
                render_table(data);
            },
        });
    }

    $('#f_apply').on('click', load_table);
    $('#f_reset').on('click', function () {
        $('#f_volunteer').val('');
        $('#f_followup_session').val('');
        $('#f_status').val('');
        load_table();
    });

    load_table();
};