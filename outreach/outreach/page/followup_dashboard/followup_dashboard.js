frappe.provide("outreach");

frappe.pages["followup-dashboard"].on_page_load = function (wrapper) {
    new outreach.FollowupDashboard(wrapper);
};

outreach.FollowupDashboard = class {
    constructor(wrapper) {
        this.wrapper = $(wrapper);
        this.page = frappe.ui.make_app_page({
            parent: this.wrapper,
            title: __("Followup Dashboard"),
            single_column: true,
        });

        this.$main = $(`
            <div class="followup-dashboard-container">
                <div class="followup-dashboard-toolbar flex gap-2 items-center mb-3">
                    <div class="column-toggle form-inline"></div>
                    <div class="ml-auto text-muted small hidden-xs">
                        ${__("Use header filters and drag columns to rearrange.")}
                    </div>
                </div>
                <div id="followup-dashboard-table"></div>
            </div>
        `);

        this.page.main.append(this.$main);

        this.$table = this.$main.find("#followup-dashboard-table");
        this.$column_toggle = this.$main.find(".column-toggle");

        this.slot_cache = {};   // { stack_name: [slot, ...] }
        this.save_timers = {};  // debounced autosave timers
        this.call_status_options = [];

        this.setup_meta_and_init();
    }

    // ------------------------------------------------------------
    // Bootstrapping
    // ------------------------------------------------------------
    setup_meta_and_init() {
        frappe.model.with_doctype("Followup Record", () => {
            const meta = frappe.get_meta("Followup Record");
            const df = (meta.fields || []).find(f => f.fieldname === "call_status");

            if (df && df.options) {
                this.call_status_options = df.options
                    .split("\n")
                    .map(v => v.trim())
                    .filter(Boolean);
            }

            this.make_table();
            this.load_data();
        });
    }

    // ------------------------------------------------------------
    // Table setup
    // ------------------------------------------------------------
    make_table() {
        if (!window.Tabulator) {
            frappe.msgprint(__("Tabulator library not found. Ensure it is included in build."));
            return;
        }

        const me = this;

        this.table = new Tabulator(this.$table[0], {
            layout: "fitColumns",
            height: "600px",
            index: "record_name",
            movableColumns: true,
            pagination: "local",
            paginationSize: 25,
            paginationSizeSelector: [25, 50, 100],
            reactiveData: false,
            clipboard: true,
            placeholder: __("No followup records found."),
            headerSort: true,

            columns: this.get_columns(),

            cellEdited: function (cell) {
                me.handle_cell_edited(cell);
            },

            rowFormatter: function (row) {
                me.row_formatter(row);
            },
        });

        this.make_column_toggle();
    }

    get_columns() {
        const textFilter = { headerFilter: "input", headerFilterPlaceholder: __("Filter") };
        const me = this;

        return [
            // Actions: Call / WhatsApp
            {
                title: "",
                field: "actions",
                width: 110,
                hozAlign: "center",
                headerSort: false,
                headerTooltip: __("Call / WhatsApp"),
                formatter: function (cell) {
                    const data = cell.getRow().getData();
                    const phone = (data.phone || "").trim();
                    if (!phone) return "";

                    const raw_digits = phone.replace(/[^0-9]/g, "");
                    const tel_link = `tel:${phone}`;
                    const wa_link = raw_digits ? `https://wa.me/${raw_digits}` : "#";

                    return `
                        <a href="${tel_link}" class="btn btn-xs btn-default" title="${__("Call")}">
                            <i class="fa fa-phone"></i>
                        </a>
                        <a href="${wa_link}" class="btn btn-xs btn-default" title="${__("WhatsApp")}"
                           target="_blank" rel="noopener noreferrer">
                            <i class="fa fa-whatsapp"></i>
                        </a>
                    `;
                },
            },

            // Student
            {
                title: __("Student"),
                field: "student_name",
                ...textFilter,
            },

            // Phone
            {
                title: __("Phone"),
                field: "phone",
                ...textFilter,
            },

            // Session = effective session_stack
            {
                title: __("Session"),
                field: "session_stack",
                ...textFilter,
            },

            // Preferred Slot (custom editor so we can async-load per stack)
            {
                title: __("Preferred Slot"),
                field: "session_slot",
                headerFilter: "input",
                headerFilterPlaceholder: __("Filter slot"),
                editor: (cell, onRendered, success, cancel) =>
                    this.session_slot_editor(cell, onRendered, success, cancel),
                formatter: function (cell) {
                    const value = cell.getValue();
                    if (!value) return "";

                    const rowData = cell.getRow().getData();
                    const stack = rowData.session_stack;
                    const slots = me.slot_cache[stack] || [];
                    const slot = slots.find(s => s.value === value);
                    return slot ? slot.label : value;
                },
            },

            // Call Status
            {
                title: __("Call Status"),
                field: "call_status",
                editor: "list", // NOT "select" in Tabulator 5+
                editorParams: () => ({
                    values: this.call_status_options || [],
                    clearable: true,
                }),
                headerFilter: "select",
                headerFilterParams: () => {
                    const options = { "": "" };
                    (this.call_status_options || []).forEach(v => {
                        options[v] = v;
                    });
                    return { values: options };
                },
            },

            // Remarks
            {
                title: __("Remarks"),
                field: "remarks",
                editor: "textarea",
                headerFilter: "input",
                headerFilterPlaceholder: __("Filter remarks"),
                widthGrow: 2,
            },

            // Last Updated (toggleable, hidden by default)
            {
                title: __("Last Updated"),
                field: "last_updated",
                headerFilter: "input",
                headerFilterPlaceholder: __("YYYY-MM-DD"),
                visible: false,
            },

            // Internal ID (toggleable, hidden by default)
            {
                title: __("Record ID"),
                field: "record_name",
                visible: false,
            },
        ];
    }

    // ------------------------------------------------------------
    // Column toggle – Bootstrap 4 style
    // ------------------------------------------------------------
    make_column_toggle() {
        if (!this.table) return;

        const columns = this.table.getColumns();
        const me = this;

        const $wrap = $(`
            <div class="dropdown">
                <button class="btn btn-xs btn-default dropdown-toggle" type="button" data-toggle="dropdown">
                    ${__("Columns")} <span class="caret"></span>
                </button>
                <ul class="dropdown-menu dropdown-menu-right p-2 small" style="max-height:260px;overflow-y:auto;"></ul>
            </div>
        `);

        const $list = $wrap.find("ul");

        columns.forEach(col => {
            const field = col.getField();
            if (!field || field === "actions") return;

            const def = col.getDefinition();
            const label = def.title || field;
            const visible = col.isVisible();
            const id = `toggle-col-${frappe.utils.get_random(6)}`;

            const $li = $(`
                <li class="dropdown-item px-1">
                    <div class="checkbox">
                        <label for="${id}">
                            <input type="checkbox" id="${id}" ${visible ? "checked" : ""}>
                            ${frappe.utils.escape_html(label)}
                        </label>
                    </div>
                </li>
            `);

            $li.find("input").on("change", function () {
                if (this.checked) {
                    me.table.showColumn(field);
                } else {
                    me.table.hideColumn(field);
                }
            });

            $list.append($li);
        });

        this.$column_toggle.empty().append($wrap);
    }

    // ------------------------------------------------------------
    // Data load
    // ------------------------------------------------------------
    load_data() {
        const me = this;
        this.page.set_indicator(__("Loading"), "orange");

        frappe.call({
            method: "outreach.outreach.page.followup_dashboard.followup_dashboard.get_followup_records",
            args: {
                limit: 500,
                start: 0,
            },
            freeze: true,
            callback: function (r) {
                const data = (r && r.message && r.message.records) || [];
                if (me.table) {
                    me.table.setData(data);
                }
                me.preload_slots_for_visible_rows();
            },
            always: function () {
                me.page.set_indicator(__("Loaded"), "green");
            },
            error: function (err) {
                me.page.set_indicator(__("Error"), "red");
                console.error("[FollowupDashboard] load_data error", err);
            },
        });
    }

    // ------------------------------------------------------------
    // Slot loading (per stack, only future slots, cached)
    // ------------------------------------------------------------
    preload_slots_for_visible_rows() {
        if (!this.table) return;
        const data = this.table.getData() || [];

        const stacks = Array.from(
            new Set(
                data.map(r => r.session_stack).filter(Boolean)
            )
        );

        stacks.forEach(stack => {
            this.fetch_slots_for_stack(stack);
        });
    }

    fetch_slots_for_stack(stack) {
        const me = this;

        if (!stack) {
            return Promise.resolve([]);
        }

        // Use cache if present
        if (Array.isArray(this.slot_cache[stack])) {
            return Promise.resolve(this.slot_cache[stack]);
        }

        return new Promise((resolve) => {
            frappe.call({
                method: "outreach.outreach.page.followup_dashboard.followup_dashboard.get_slots_for_stack",
                args: { stack },
                callback: function (r) {
                    const slots = (r && r.message) || [];
                    // normalize to [{value,label,...}]
                    me.slot_cache[stack] = slots.map(s => ({
                        name: s.name,
                        value: s.value || s.name,
                        label: s.label || s.name,
                        date_and_time: s.date_and_time,
                    }));
                    resolve(me.slot_cache[stack]);
                },
                error: function (err) {
                    console.error("[FollowupDashboard] fetch_slots_for_stack error", err);
                    me.slot_cache[stack] = [];
                    resolve([]);
                },
            });
        });
    }

    // ------------------------------------------------------------
    // Custom editor for Preferred Slot
    // ------------------------------------------------------------
    session_slot_editor(cell, onRendered, success, cancel) {
        const rowData = cell.getRow().getData();
        const stack = rowData.session_stack;
        const current_value = cell.getValue();

        const select = document.createElement("select");
        select.style.width = "100%";
        select.style.boxSizing = "border-box";
        select.classList.add("form-control", "input-sm");

        // Default while loading
        const addOption = (value, label, selected) => {
            const opt = document.createElement("option");
            opt.value = value || "";
            opt.textContent = label || "";
            if (selected) opt.selected = true;
            select.appendChild(opt);
        };

        if (!stack) {
            addOption("", __("No stack"));
        } else {
            addOption("", __("Loading..."));
        }

        // Focus after render
        onRendered(function () {
            select.focus();
        });

        // Load slots (async) then populate
        if (stack) {
            this.fetch_slots_for_stack(stack).then(slots => {
                select.innerHTML = "";
                addOption("", __("Select slot"));
                slots.forEach(s => {
                    addOption(s.value, s.label, s.value === current_value);
                });
                select.focus();
            });
        }

        // Commit on change or blur
        const commit = () => {
            success(select.value || null);
        };

        select.addEventListener("change", commit);
        select.addEventListener("blur", commit);
        select.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                commit();
            }
            if (e.key === "Escape") {
                e.preventDefault();
                cancel();
            }
        });

        return select;
    }

    // ------------------------------------------------------------
    // Autosave handling
    // ------------------------------------------------------------
    handle_cell_edited(cell) {
        const field = cell.getField();
        const editable_fields = ["call_status", "remarks", "session_slot"];

        if (editable_fields.indexOf(field) === -1) return;

        const rowData = cell.getRow().getData();
        const record_name = rowData.record_name;
        if (!record_name) return;

        const value = cell.getValue();
        this.queue_save(record_name, field, value);
    }

    queue_save(record_name, field, value) {
        const key = `${record_name}::${field}`;
        const me = this;

        if (this.save_timers[key]) {
            clearTimeout(this.save_timers[key]);
        }

        this.save_timers[key] = setTimeout(function () {
            me.save_timers[key] = null;
            me.save_cell(record_name, field, value);
        }, 600); // debounce 500–600 ms
    }

    save_cell(record_name, field, value) {
        const me = this;

        // Backend maps "session_slot" -> "preferred_session_slot"
        frappe.call({
            method: "outreach.outreach.page.followup_dashboard.followup_dashboard.update_followup_record",
            args: {
                record_name,
                field,
                value,
            },
            freeze: false,
            callback: function () {
                if (field === "session_slot" && me.table) {
                    const row = me.table.getRow(record_name);
                    if (row) {
                        row.update({ session_slot: value });
                    }
                }
            },
            error: function (err) {
                console.error("[FollowupDashboard] save_cell error", err);
                frappe.msgprint({
                    title: __("Error"),
                    message: __("Could not save change for record {0}", [frappe.utils.escape_html(record_name)]),
                    indicator: "red",
                });
            },
        });
    }

    // ------------------------------------------------------------
    // Row styling
    // ------------------------------------------------------------
    row_formatter(row) {
        const data = row.getData();
        const status = (data.call_status || "").toLowerCase();

        const el = row.getElement();
        $(el).removeClass("followup-status-tbc followup-status-done followup-status-other");

        if (!status || status === "to be called") {
            $(el).addClass("followup-status-tbc");
        } else if (status === "done" || status === "attended") {
            $(el).addClass("followup-status-done");
        } else {
            $(el).addClass("followup-status-other");
        }
    }
};