odoo.define('pos_retail.restaurant', function (require) {

    const floors = require('pos_restaurant.floors');
    const {gui} = require('point_of_sale.Gui');
    const {posbus} = require('point_of_sale.utils');
    var sync = require('pos_retail.synchronization');
    var multi_print = require('pos_restaurant.multiprint');
    var rpc = require('pos.rpc');
    var models = require('point_of_sale.models');
    var core = require('web.core');
    var _t = core._t;
    const BigData = require('pos_retail.big_data');

    var _super_posmodel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {
            var restaurant_floor_model = this.get_model('restaurant.floor');
            restaurant_floor_model.domain = function (self) {
                return [['id', 'in', self.config.floor_ids]]
            };
            restaurant_floor_model.condition = function (self) {
                var condition = self.config.floor_ids.length > 0 && self.config.is_table_management;
                if (!condition) {
                    self.floors = [];
                    self.floors_by_id = {};
                }
                return condition

            };
            var _super_loaded_restaurant_floor_model = restaurant_floor_model.loaded;
            restaurant_floor_model.loaded = function (self, floors) {
                _super_loaded_restaurant_floor_model(self, floors);
                self.floor_ids = [];
                self.floors = floors;
                for (var i = 0; i < floors.length; i++) {
                    var floor = floors[i];
                    self.floor_ids.push(floor.id);
                }
            };
            var restaurant_table_model = this.get_model('restaurant.table');
            restaurant_table_model.fields.push('locked', 'user_ids', 'pricelist_id')
            restaurant_table_model.domain = function (self) {
                return [['floor_id', 'in', self.config.floor_ids]]
            };
            restaurant_table_model.condition = function (self) {
                var condition = self.floor_ids && self.floor_ids.length > 0;
                if (!condition) {
                    self.tables_by_id = {};
                }
                return condition;
            };
            var _super_loaded_restaurant_table_model = restaurant_table_model.loaded;
            restaurant_table_model.loaded = function (self, tables) {
                var new_tables = [];
                for (var i = 0; i < tables.length; i++) {
                    var table = tables[i];
                    if (!table.user_ids || table.user_ids.length == 0 || table.user_ids.indexOf(self.user.id) != -1) {
                        new_tables.push(table)
                    }
                }
                self.tables = new_tables;
                _super_loaded_restaurant_table_model(self, new_tables);
            };
            _super_posmodel.initialize.apply(this, arguments);
        },
        async unlock_table() {
            var self = this;
            let resultUnLock = await rpc.query({
                model: 'restaurant.table',
                method: 'lock_table',
                args: [[this.table_click.id], {
                    'locked': false,
                }],
            }, {
                timeout: 30000,
                shadow: true,
            })
            if (resultUnLock) {
                this.table_click['locked'] = false;
                const table = this.tables.find(t => t.id == this.table_click.id)
                table.locked = false;
                this.set_table(this.table_click);
                var orders = this.get('orders').models;
                const order_of_table = orders.find(o => o.table && o.table.id == table.id)
                if (self.pos_bus && order_of_table) {
                    self.pos_bus.send_notification({
                        data: {
                            order: order_of_table.export_as_JSON(),
                            table_id: order_of_table.table.id,
                            order_uid: order_of_table.uid,
                            lock: false,
                        },
                        action: 'lock_table',
                        order_uid: order_of_table.uid,
                    })
                }
            }
        },
        /// ======================== FORCE CORE ODOO (KIMANH) =========================//
        // todo: stop sync direct to odoo server. We no need this feature
        _get_from_server: function (table_id, options) { // GET drafts order with this table ID
            return Promise.resolve([]);
        },
        sync_from_server: function (table, table_orders, order_ids) { // save draft orders to server
            this.clean_table_transfer(table);
        },
        sync_to_server: function (table, order) { // set order[1] to Table
            return this.set_order_on_table(order);
        },
        async set_table(table, order) {
            const self = this;
            if (table && table.locked) {
                this.table_click = table;
                let validate = await this._validate_by_manager(this.env._t(' Unlock this Table'));
                if (validate) {
                    await this.unlock_table()
                } else {
                    return this.chrome.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Required your Manager unlock this table for continue order')
                    })
                }
            }
            const order_to_transfer_to_different_table = this.order_to_transfer_to_different_table;
            _super_posmodel.set_table.apply(this, arguments);
            if (order_to_transfer_to_different_table && table && this.pos_bus) {
                order_to_transfer_to_different_table.syncing = true
                this.pos_bus.send_notification({
                    action: 'order_transfer_new_table',
                    data: {
                        uid: order_to_transfer_to_different_table.uid,
                        table_id: table.id,
                        floor_id: table.floor_id[0],
                    },
                    order_uid: order_to_transfer_to_different_table.uid,
                });
                order_to_transfer_to_different_table.syncing = false
            }
            var selectedOrder = this.get_order();
            if (this.config.required_set_guest && selectedOrder && !selectedOrder.guest_not_set) {
                setTimeout(function () {
                    self.get_order().ask_guest()
                }, 1000)
            }
            if (table && table.pricelist_id) {
                let pricelist = this.pricelists.find(p => p.id == table.pricelist_id[0])
                if (pricelist) {
                    setTimeout(function () {
                        if (self.get_order()) {
                            self.get_order().set_pricelist(pricelist)
                        }
                    }, 500)
                }
            }
        },
        /// ======================== END FORECE =========================//

        load_server_data: function () {
            var self = this;
            console.log('load_server_data 4')
            return _super_posmodel.load_server_data.apply(this, arguments).then(function () {
                self.config.iface_floorplan = self.floors.length;
            });
        },
        // TODO: play sound when new transaction coming
        play_sound: function () {
            var src = "/pos_retail/static/src/sounds/demonstrative.mp3";
            $('body').append('<audio src="' + src + '" autoplay="true"></audio>');
        },
        // TODO: sync between sesion on restaurant
        get_notifications: function (message) {
            var action = message['action'];
            // if (this.config.screen_type && this.config.screen_type == 'kitchen' && ['order_transfer_new_table', 'request_printer', 'transfer_succeed_receipt', 'paid_order', 'unlink_order'].indexOf(action) == -1) {
            //     console.warn("[get_notifications] Kitchen Screen Reject SYNC, only action in list ['request_printer', 'line_removing', 'paid_order'] Can Sync")
            //     return true
            // }
            if (['paid_order', 'unlink_order'].includes(action) && this.config.screen_type != 'kitchen') {
                this.db.save_done_order(message['order_uid'])
            } else {
                if (this.db.get_orders_done().includes(message['order_uid'])) {
                    console.warn('[get_notifications] ' + message['order_uid'] + ' Removed or Paid before. Stop Sync')
                    return true
                }
            }
            _super_posmodel.get_notifications.apply(this, arguments);
            if (action == 'order_transfer_new_table') {
                this.sync_order_transfer_new_table(message['data']);
            }
            if (action == 'set_customer_count') {
                this.sync_set_customer_count(message['data']);
            }
            if (action == 'request_printer') {
                this.sync_request_printer(message['data']);
            }
            if (action == 'transfer_succeed_receipt') {
                this.sync_transfer_succeed_receipt(message['data']);
            }
            if (action == 'set_note') {
                this.sync_set_note(message['data']);
            }
            if (this.floors && this.floors.length && this.tables && this.tables.length) {
                posbus.trigger('refresh:FloorScreen')
            }
            if (action == 'new_qrcode_order') {
                this.sync_new_qrcode_order(message['data']);
            }
            if (action == 'cashier_activity' && this.session.restaurant_order && this.get_order_by_uid(message['order_uid'])) {
                this.chrome.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert'),
                    body: message['data'],
                    disableCancelButton: true,
                })
            }
            if (action == 'request_printer' && this.session.restaurant_order && this.get_order_by_uid(message['order_uid'])) {
                this.chrome.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert'),
                    body: this.env._t('Your Order Transfer to Kitchen now. Please keep waiting us processing products'),
                    disableCancelButton: true,
                })
            }
            if (this.config.sync_play_sound) {
                if (this.config.screen_type != 'kitchen' || (this.config.screen_type == 'kitchen' && action == 'request_printer')) {
                    this.play_sound();
                }
            }
            posbus.trigger('save-receipt', {})
        },
        async sync_new_qrcode_order(orderJson) {
            var order = this.get_order_by_uid(orderJson['uid']);
            if (order) {
                return this.sync_new_order(orderJson)
            } else {
                posbus.trigger('save-qrcode-order', {})
                this.db.saveQrCodeOrder([orderJson])
                if (this.config.qrcode_order_auto_alert) {
                    let {confirmed, payload: result} = await this.chrome.showPopup('ConfirmPopup', {
                        title: this.env._t('Alert, New Order Waiting Confirm'),
                        body: this.env._t('Have 1 Order requested by customer via Scan QrCode with name is: ') + orderJson.name + this.env._t(' .Click to Ok button for review it now')
                    })
                    if (confirmed) {
                        let order = this.db.getQrCodeOrderbyUid(orderJson.uid)
                        if (order) {
                            this.chrome.showScreen('QrCodeOrderScreen', {
                                selectedOrder: order
                            });
                        }
                    }
                }
            }
        },
        // TODO: neu la man hinh nha bep / bar
        //         - khong quan tam no la floor hay table hay pos cashier
        //         - luon luon dong bo vs tat ca
        sync_new_order: function (vals) {
            _super_posmodel.sync_new_order.apply(this, arguments);
            var order_exist = this.get_order_by_uid(vals['uid']);
            if (order_exist) {
                return order_exist;
            } else {
                if (this.config.screen_type != 'kitchen') {
                    var orders = this.get('orders', []);
                    if (vals['floor_id'] && !this.floors_by_id[vals['floor_id']]) {
                        vals['floor_id'] = null;
                    }
                    if (vals['table_id'] && !this.floors_by_id[vals['table_id']]) {
                        vals['table_id'] = null;
                    }
                    var order = new models.Order({}, {pos: this, json: vals});
                    order.syncing = true;
                    orders.add(order);
                    order.trigger('change', order);
                    order.syncing = false;
                    return order
                } else {
                    return null
                }
            }
        },
        sync_unlink_order: function (uid, action, user) {
            let res;
            if (this.config.screen_type == 'kitchen') {
                console.log('It a kitchen screen, keep order')
                res = true
            } else {
                res = _super_posmodel.sync_unlink_order.apply(this, arguments);
            }
            posbus.trigger('orderReceiptRemoved', {
                uid: uid,
                action: action,
                user: user
            })
            return res
        },
        sync_transfer_succeed_receipt: function (data) {
            posbus.trigger('syncTransferSucceedReceipt', {
                request_time: data.request_time,
                action: data.action,
                user: data.user
            })
        },
        // TODO: dong bo khi in xong
        sync_request_printer: function (vals) { // TODO: update variable set_dirty of line
            var order = this.get_order_by_uid(vals.uid);
            var computeChanges = vals.computeChanges;
            if (order) {
                order.syncing = true;
                order.orderlines.each(function (line) {
                    line.set_dirty(false);
                });
                order.saved_resume = order.build_line_resume();
                order.trigger('change', order);
                order.syncing = false;
            }
            // trigger for kitchen screen reload
            if (this.config.screen_type && (computeChanges.new.length > 0 || computeChanges.cancelled.length > 0)) {
                if (this.config.screen_type != 'kitchen') { // if waiters or cashiers, and order not still on Session, reject it
                    let orderExist = this.get_order_by_uid(computeChanges.uid)
                    if (!orderExist) {
                        return true;
                    }
                }
                posbus.trigger('newOrderReceiptsComing', computeChanges); // trigger kitchen screen
            }
        },
        // TODO: dong bo chuyen ban, tach ban
        sync_order_transfer_new_table: function (vals) {
            var order = this.get_order_by_uid(vals.uid);
            if (order != undefined) {
                if (this.floors_by_id[vals.floor_id] && this.tables_by_id[vals.table_id]) {
                    var table = this.tables_by_id[vals.table_id];
                    var floor = this.floors_by_id[vals.floor_id];
                    if (table && floor) {
                        order.table = table;
                        order.table_id = table.id;
                        order.floor = floor;
                        order.floor_id = floor.id;
                        order.trigger('change', order);
                        if (this.get_order() && order.uid == this.get_order().uid) {
                            this.chrome.showScreen('FloorScreen');
                        }
                    }
                    if (!table || !floor) {
                        order.table = null;
                        order.trigger('change', order);
                    }
                }
            }
            posbus.trigger('orderTransferTable', vals); // trigger kitchen screen
        },
        // TODO: dong bo tong so khach hang tren ban
        sync_set_customer_count: function (vals) { // update count guest
            var order = this.get_order_by_uid(vals.uid);
            if (order) {
                order.syncing = true;
                order.set_customer_count(vals.count);
                order.trigger('change', order);
                order.syncing = false;
            }
        },
        // TODO: dong bo ghi chu cua line
        sync_set_note: function (vals) {
            var line = this.get_line_by_uid(vals['uid']);
            if (line) {
                line.syncing = true;
                line.set_note(vals['note']);
                line.syncing = false;
            }
        },
    });

    var _super_order = models.Order.prototype;
    models.Order = models.Order.extend({
        initialize: function (attributes, options) {
            _super_order.initialize.apply(this, arguments);
            if (!this.notify_messages) {
                this.notify_messages = {};
            }
            this.state = false;
            if (!options.json) {
                this.last_call_printers_buy_orderline_uid = {};
            }
        },
        init_from_JSON: function (json) {
            var res = _super_order.init_from_JSON.apply(this, arguments);
            if (json.last_call_printers_buy_orderline_uid) {
                this.last_call_printers_buy_orderline_uid = json.last_call_printers_buy_orderline_uid
            }
            if (json.take_away_order) {
                this.take_away_order = json.take_away_order
            }
            return res
        },
        export_as_JSON: function () {
            var json = _super_order.export_as_JSON.apply(this, arguments);
            if (this.notify_messages) {
                json.notify_messages = this.notify_messages;
            }
            if (this.last_call_printers_buy_orderline_uid) {
                json.last_call_printers_buy_orderline_uid = this.last_call_printers_buy_orderline_uid;
            }
            if (this.take_away_order) {
                json.take_away_order = this.take_away_order
            }
            return json;
        },
        get_lines_missed_request_kitchen: function () {
            var delivery_kitchen = false;
            this.orderlines.each(function (line) {
                if (line['state'] == 'Draft' || line['state'] == 'Priority') {
                    delivery_kitchen = true;
                }
            });
            return delivery_kitchen;
        },
        get_lines_need_delivery: function () {
            var need_delivery = false;
            this.orderlines.each(function (line) {
                if (line['state'] == 'Ready') {
                    need_delivery = true
                }
            });
            return need_delivery;
        },
        set_customer_count: function (count) { //sync to other sessions
            var res = _super_order.set_customer_count.apply(this, arguments)
            if ((this.syncing == false || !this.syncing) && this.pos.pos_bus) {
                var order = this.export_as_JSON();
                this.pos.pos_bus.send_notification({
                    action: 'set_customer_count',
                    data: {
                        uid: this.uid,
                        count: count
                    },
                    order_uid: order['uid'],
                });
            }
            return res
        },
        _update_last_call_printers_buy_orderline_uid: function () {
            for (var uid in this.last_call_printers_buy_orderline_uid) {
                var line_need_update = _.find(this.orderlines.models, function (line) {
                    return line.uid == uid
                });
                if (line_need_update) {
                    var new_value = line_need_update._build_update_data();
                    this.last_call_printers_buy_orderline_uid[uid] = new_value;
                } else {
                    this.last_call_printers_buy_orderline_uid[uid] = null;
                }
            }
        },
        buildReceiptKitchen(orderReceipt) { // todo: request number and session_id of computeChanges is key unit of request print receipt
            const ticket_number = this.pos.db.getKitchenTicketOrderNumber()
            if (this.take_away_order || !orderReceipt.table) { // if clicked to button take away, or pos config have not add table : it mean order is take away
                orderReceipt['take_away_order'] = true
            }
            orderReceipt['ticket_number'] = ticket_number
            orderReceipt['total_items'] = 0
            orderReceipt['request_time'] = new Date().getTime()
            orderReceipt['state'] = 'New'
            let kitchenReceiptOrders = this.pos.db.getOrderReceipts()
            if (orderReceipt.new.length > 0 || orderReceipt.cancelled.length > 0 && this.pos.config.sync_multi_session && this.pos.config.kitchen_screen) {
                orderReceipt.new.forEach(n => {
                    n.request_time = orderReceipt.request_time
                    n.state = 'New'
                    orderReceipt['total_items'] += n.qty
                })
                orderReceipt.cancelled.forEach(c => {
                    c.request_time = orderReceipt.request_time
                    c.state = 'Cancelled'
                    orderReceipt['total_items'] -= c.qty
                })
                if (orderReceipt.new.length == 0 && orderReceipt.cancelled.length > 0) {
                    orderReceipt['state'] = 'Cancelled'
                }
                kitchenReceiptOrders.push(orderReceipt);
                this.pos.db.saveOrderReceipts(kitchenReceiptOrders)
            }
            return orderReceipt
        },
    });

    var _super_order_line = models.Orderline.prototype;
    models.Orderline = models.Orderline.extend({
        initialize: function (attributes, options) {
            _super_order_line.initialize.apply(this, arguments);
            if (!options.json && this.pos.config.sync_multi_session && this.pos.config.send_order_to_kitchen && this.pos.config.screen_type != 'kitchen') {
                this.kitchen_notes = '';
                this.cancel_reason = ''
                this.creation_time = new Date().toLocaleTimeString();
            }
        },
        init_from_JSON: function (json) {
            if (json.creation_time) {
                this.creation_time = json.creation_time;
            }
            if (json.kitchen_notes) {
                this.kitchen_notes = json.kitchen_notes;
            }
            if (json.cancel_reason) {
                this.cancel_reason = json.cancel_reason;
            }
            _super_order_line.init_from_JSON.apply(this, arguments);
        },
        export_as_JSON: function () {
            var json = _super_order_line.export_as_JSON.apply(this, arguments);
            if (this.kitchen_notes) {
                json.kitchen_notes = this.kitchen_notes;
            }
            if (this.cancel_reason) {
                json.cancel_reason = this.cancel_reason;
            }
            if (this.creation_time) {
                json.creation_time = this.creation_time;
            }
            return json;
        },
        _build_update_data: function () {
            const d = new Date();
            let hours = '' + d.getHours();
            hours = hours.length < 2 ? ('0' + hours) : hours;
            const minutes = '' + d.getMinutes();
            const product = this.get_product();
            var pos_categ_id = product.pos_categ_id;
            if (pos_categ_id.length) {
                pos_categ_id = pos_categ_id[1]
            }
            let new_update = {
                sequence_number: this.order.sequence_number,
                uid: this.uid,
                qty: Number(this.get_quantity()),
                note: this.get_note(),
                name: this.product.name,
                product_id: product.id,
                product_name_wrapped: this.generate_wrapped_product_name(),
                uom: [],
                variants: [],
                tags: [],
                selected_combo_items: null,
                combo_items: [],
                modifiers: [],
                category: pos_categ_id,
                state: this.state,
                time: hours + ':' + minutes,
            }
            if (this['variants']) {
                new_update['variants'] = this['variants'];
            }
            if (this['tags']) {
                new_update['tags'] = this['tags'];
            }
            if (this.uom_id) {
                new_update['uom'] = this.pos.uom_by_id[this.uom_id]
            }
            if (this.product.uom_id && !this.uom_id) {
                new_update['uom'] = this.pos.uom_by_id[this.product.uom_id[0]]
            }
            if (this.combo_items && this.combo_items.length) {
                new_update['combo_items'] = this['combo_items']
            }
            if (this.modifiers) {
                new_update['modifiers'] = this['modifiers']
            }
            if (this.selected_combo_items) {
                new_update['selected_combo_items'] = [];
                for (var product_id in this.selected_combo_items) {
                    let productComboItem = this.pos.db.get_product_by_id(product_id);
                    if (productComboItem) {
                        new_update['selected_combo_items'].push({
                            'product_name': productComboItem.display_name,
                            'quantity': this.selected_combo_items[product_id]
                        })
                    }
                }
            }
            return new_update;
        },
        printable: function () {
            if (this.get_product()) {
                return _super_order_line.printable.apply(this, arguments)
            } else {
                return null;
            }
        },
        set_note: function (note) {
            var res = _super_order_line.set_note.apply(this, arguments);
            // if ((this.syncing == false || !this.syncing) && this.pos.pos_bus) {
            //     var order = this.order.export_as_JSON();
            //     this.pos.pos_bus.send_notification({
            //         action: 'set_note',
            //         data: {
            //             uid: this.uid,
            //             note: note,
            //         },
            //         order_uid: order.uid,
            //     });
            // }
            if (this.get_allow_sync()) {
                this.trigger_update_line();
            }
            return res;
        },
        get_line_diff_hash: function () {
            var str = this.id + '|';
            if (this.get_note()) {
                str += this.get_note();
            }
            if (this.uom_id) {
                str += this.uom_id;
            }
            if (this.variants && this.variants.length) {
                for (var i = 0; i < this.variants.length; i++) {
                    var variant = this.variants[i];
                    str += variant['attribute_id'][0];
                    str += '|' + variant['value_id'][0];
                }
            }
            if (this.tags && this.tags.length) {
                for (var i = 0; i < this.tags.length; i++) {
                    var tag = this.tags[i];
                    str += '|' + tag['id'];
                }
            }
            if (this.combo_items && this.combo_items.length) {
                for (var i = 0; i < this.combo_items.length; i++) {
                    var combo = this.combo_items[i];
                    str += '|' + combo['id'];
                }
            }
            return str
        },
    });

    const _super_sync = sync.pos_bus.prototype;
    sync.pos_bus = sync.pos_bus.extend({

        sync_receipt(receipt) { // send receipt update from this session to another session
            this.send_notification({
                action: 'request_printer',
                data: {
                    uid: receipt.uid,
                    computeChanges: receipt,
                },
                order_uid: receipt.uid,
            })
        },
        transfer_succeed_receipt(receipt, action, user) { // when waiter transfer products succeed, request another sessions drop receipt
            this.send_notification({
                action: 'transfer_succeed_receipt',
                data: {
                    request_time: receipt.request_time,
                    action: action,
                    user: user,
                },
                order_uid: receipt.uid
            })
        },
        send_notification: function (value, send_manual = false) {
            if (this.pos.config.screen_type == 'kitchen' && value.action == 'new_order') {
                return true // drop notification because we dont need sync notification from kitchen to any sessions with action new_order when start screen
            }
            _super_sync.send_notification.apply(this, arguments);
            if (value.action == 'unlink_order' || value.action == 'paid_order') {
                posbus.trigger('orderReceiptRemoved', {
                    uid: value.order_uid,
                    action: value.action,
                    user: value.user
                })
            }
            posbus.trigger('save-receipt')
        }
        //---------------------------------------------
    });

    _super_order.computeChanges = function (categories) {
        var d = new Date();
        var hours = '' + d.getHours();
        hours = hours.length < 2 ? ('0' + hours) : hours;
        var minutes = '' + d.getMinutes();
        minutes = minutes.length < 2 ? ('0' + minutes) : minutes;
        var current_res = this.build_line_resume();
        var old_res = this.saved_resume || {};
        var json = this.export_as_JSON();
        var add = [];
        var rem = [];
        var line_hash;
        for (line_hash in current_res) {
            var curr = current_res[line_hash];
            var old = old_res[line_hash];
            var product = this.pos.db.get_product_by_id(curr.product_id);
            var pos_categ_id = product.pos_categ_id;
            if (pos_categ_id.length) {
                pos_categ_id = pos_categ_id[1]
            }
            if (typeof old === 'undefined') {
                add.push({
                    'sequence_number': this.sequence_number,
                    'order_uid': json.uid,
                    'id': curr.product_id,
                    'uid': curr.uid,
                    'name': product.display_name,
                    'name_wrapped': curr.product_name_wrapped,
                    'note': curr.note,
                    'qty': curr.qty,
                    'uom': curr.uom,
                    'variants': curr.variants,
                    'tags': curr.tags,
                    'combo_items': curr.combo_items,
                    'modifiers': curr.modifiers,
                    'state': curr.state,
                    'category': pos_categ_id,
                    'time': hours + ':' + minutes,
                    'selected_combo_items': curr.selected_combo_items,
                });
            } else if (old.qty < curr.qty) {
                add.push({
                    'sequence_number': this.sequence_number,
                    'order_uid': json.uid,
                    'id': curr.product_id,
                    'uid': curr.uid,
                    'name': product.display_name,
                    'name_wrapped': curr.product_name_wrapped,
                    'note': curr.note,
                    'qty': curr.qty - old.qty,
                    'uom': curr.uom,
                    'variants': curr.variants,
                    'tags': curr.tags,
                    'combo_items': curr.combo_items,
                    'modifiers': curr.modifiers,
                    'state': curr.state,
                    'category': pos_categ_id,
                    'time': hours + ':' + minutes,
                    'selected_combo_items': curr.selected_combo_items,
                });
            } else if (old.qty > curr.qty) {
                rem.push({
                    'sequence_number': this.sequence_number,
                    'order_uid': json.uid,
                    'id': curr.product_id,
                    'uid': curr.uid,
                    'name': product.display_name,
                    'name_wrapped': curr.product_name_wrapped,
                    'note': curr.note,
                    'qty': old.qty - curr.qty,
                    'uom': curr.uom,
                    'variants': curr.variants,
                    'tags': curr.tags,
                    'combo_items': curr.combo_items,
                    'modifiers': curr.modifiers,
                    'state': 'Cancelled',
                    'category': pos_categ_id,
                    'time': hours + ':' + minutes,
                    'selected_combo_items': curr.selected_combo_items,
                });
            }
        }

        for (line_hash in old_res) {
            if (typeof current_res[line_hash] === 'undefined') {
                var old = old_res[line_hash];
                var product = this.pos.db.get_product_by_id(old.product_id);
                if (!product) {
                    continue
                }
                var pos_categ_id = product.pos_categ_id;
                if (pos_categ_id.length) {
                    pos_categ_id = pos_categ_id[1]
                }
                rem.push({
                    'sequence_number': this.sequence_number,
                    'order_uid': json.uid,
                    'id': old.product_id,
                    'uid': old.uid,
                    'name': product.display_name,
                    'name_wrapped': old.product_name_wrapped,
                    'note': old.note,
                    'qty': old.qty,
                    'uom': old.uom,
                    'variants': old.variants,
                    'tags': old.tags,
                    'combo_items': old.combo_items,
                    'modifiers': old.modifiers,
                    'state': 'Cancelled',
                    'category': pos_categ_id,
                    'time': hours + ':' + minutes,
                    'selected_combo_items': old.selected_combo_items,
                });
            }
        }
        if (categories && categories.length > 0) {
            // filter the added and removed orders to only contains
            // products that belong to one of the categories supplied as a parameter

            var self = this;

            var _add = [];
            var _rem = [];

            for (var i = 0; i < add.length; i++) {
                if (self.pos.db.is_product_in_category(categories, add[i].id)) {
                    _add.push(add[i]);
                }
            }
            add = _add;

            for (var i = 0; i < rem.length; i++) {
                if (self.pos.db.is_product_in_category(categories, rem[i].id)) {
                    _rem.push(rem[i]);
                }
            }
            rem = _rem;
        }
        let linePriority = add.find((l) => l.state == 'Priority')
        let priority = false
        if (linePriority) {
            priority = true
        }
        this.last_sync = {
            'session_id': this.pos.pos_session.id,
            'priority': priority,
            'user': this.pos.user.name,
            'customer_count': json['customer_count'],
            'guest_number': json['guest_number'],
            'guest': json['guest'],
            'note': json['note'],
            'uid': json['uid'],
            'sequence_number': json['sequence_number'],
            'new': add,
            'cancelled': rem,
            'table': json.table || false,
            'floor': json.floor || false,
            'name': json.name || 'unknown order',
            'time': {
                'hours': hours,
                'minutes': minutes,
            },
        };
        this.last_sync.new = this.last_sync.new.filter(n => n.qty > 0)
        this.last_sync.cancelled = this.last_sync.cancelled.filter(n => n.qty > 0)
        if (add) {
            for (var i = 0; i < add.length; i++) {
                if (!this.last_call_printers_buy_orderline_uid) {
                    this.last_call_printers_buy_orderline_uid = {};
                }
                this.last_call_printers_buy_orderline_uid[add[i]['uid']] = add[i]
            }
        }
        if (add.length == 0) {
            this._update_last_call_printers_buy_orderline_uid()
        }
        return this.last_sync;
    };

    _super_order.build_line_resume = function () {
        // todo:  receipt kitchen line print
        var resume = {};
        var self = this;
        // const linesIsAppetizer = this.orderlines.filter(l => l.mp_dirty && self.pos.pos_categories_appetizer.includes(l.product.pos_categ_id)).map
        // let linesUidNotSubmit = [];
        // if (linesIsAppetizer.length) {
        //     let {confirmed, payload: confirm} = this.pos.chrome.showPopup('ConfirmPopup', {
        //         title: this.pos.chrome.env._t('Alert'),
        //         body: this.pos.chrome.env._t('Are you want submit only Products Appetizer. If yes click Yes and close Popup and click close Button'),
        //     })
        //     if (confirmed) {
        //         for (let i = 0; i < linesIsAppetizer.length; i++) {
        //             linesUidNotSubmit.push(linesIsAppetizer[i]['uid'])
        //         }
        //     }
        // }
        this.orderlines.each(function (line) {
            if (line.mp_skip) {
                return;
            }
            let line_hash = line.get_line_diff_hash();
            let qty = Number(line.get_quantity());
            let note = line.get_note();
            var product_id = line.get_product().id;
            var product = self.pos.db.get_product_by_id(product_id);
            if (!product) {
                return
            }
            var pos_categ_id = product.pos_categ_id;
            if (pos_categ_id.length) {
                pos_categ_id = pos_categ_id[1]
            }
            if (typeof resume[line_hash] === 'undefined') {
                resume[line_hash] = {
                    sequence_number: this.sequence_number,
                    order_uid: this.uid,
                    uid: line.uid,
                    qty: qty,
                    note: note,
                    product_id: product_id,
                    product_name_wrapped: line.generate_wrapped_product_name(),
                    uom: null,
                    variants: null,
                    tags: null,
                    selected_combo_items: null,
                    generic_options: null,
                    combo_items: null,
                    modifiers: null,
                    category: pos_categ_id,
                    state: line.state
                }
                if (line['variants']) {
                    resume[line_hash]['variants'] = line['variants'];
                }
                if (line['tags'] && line['tags'].length) {
                    resume[line_hash]['tags'] = line['tags'];
                }
                if (line.product.uom_id && !line.uom_id) {
                    resume[line_hash]['uom'] = self.pos.uom_by_id[line.product.uom_id[0]]
                }
                if (line.uom_id) {
                    resume[line_hash]['uom'] = self.pos.uom_by_id[line.uom_id]
                }
                if (line.combo_items && line.combo_items.length) {
                    resume[line_hash]['combo_items'] = line['combo_items']
                }
                if (line.modifiers) {
                    resume[line_hash]['modifiers'] = line['modifiers']
                }
                if (line.generic_options && line.generic_options.length) {
                    resume[line_hash]['generic_options'] = line['generic_options']
                }
                if (line.selected_combo_items) {
                    resume[line_hash]['selected_combo_items'] = [];
                    for (var product_id in line.selected_combo_items) {
                        var product = self.pos.db.get_product_by_id(product_id);
                        if (product) {
                            resume[line_hash]['selected_combo_items'].push({
                                'product_name': product.display_name,
                                'quantity': line.selected_combo_items[product_id]
                            })
                        }
                    }
                }
            } else {
                resume[line_hash].qty += qty;
            }
        });
        return resume;
    };
});