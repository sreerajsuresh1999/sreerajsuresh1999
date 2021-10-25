odoo.define('pos_retail.synchronization', function (require) {
    const models = require('point_of_sale.models');
    const rpc = require('pos.rpc');
    const Backbone = window.Backbone;
    const Session = require('web.Session');
    const db = require('point_of_sale.DB');
    const session = require('web.session');
    const RetailOrder = require('pos_retail.order');
    const exports = {};
    const core = require('web.core');
    const _t = core._t;
    const bus = require('pos_retail.core_bus');
    const {posbus} = require('point_of_sale.utils');
    const BigData = require('pos_retail.big_data');

    models.load_models([
        { // TODO: for offline mode
            model: 'pos.iot',
            condition: function (self) {
                if (self.config.sync_multi_session && self.config.sync_multi_session_offline && self.config.sync_multi_session_offline_iot_ids.length) {
                    return true
                } else {
                    return false;
                }
            },
            fields: [
                'name',
                'prefix',
                'proxy',
                'port',
                'product_ids',
                'screen_kitchen',
                'login_kitchen',
                'password_kitchen',
                'odoo_public_proxy',
            ],
            domain: function (self) {
                return [['id', 'in', self.config.sync_multi_session_offline_iot_ids]]
            },
            loaded: function (self, iot_boxes) {
                self.iot_boxes = iot_boxes;
                self.iot_box_by_id = {};
                self.iot_connections = [];
                self.iot_https_need_verify = [];
                for (let i = 0; i < iot_boxes.length; i++) {
                    let iot_box = iot_boxes[i];
                    let iot_url = iot_box.prefix;
                    iot_url += '://';
                    iot_url += iot_box.proxy;
                    if (iot_box.port) {
                        iot_url += ':' + iot_box.port;
                    }
                    self.iot_box_by_id[iot_boxes[i].id] = iot_boxes[i];
                    let iot_connection = new Session(void 0, iot_url, {
                        use_cors: true
                    });
                    iot_connection.rpc('/pos/passing/login', {}, {shadow: true, timeout: 2500})
                        .then(function (status) {
                            console.log('Result Ping POSBOX: ' + status)
                        }, function (error) {
                            console.error('Has Error when connecting to posbox')
                            alert('Has Error when connecting to posbox. Please check your internet or posbox address')
                        })
                    if (iot_box.screen_kitchen) {
                        iot_connection['screen_kitchen'] = iot_box['screen_kitchen'];
                        iot_connection['login_kitchen'] = iot_box['login_kitchen'];
                        iot_connection['password_kitchen'] = iot_box['password_kitchen'];
                        iot_connection['odoo_public_proxy'] = iot_box['odoo_public_proxy']
                    }
                    self.iot_connections.push(iot_connection)
                    self.iot_https_need_verify.push(iot_url)
                }
            }
        },
        { // TODO: for online mode. sync direct to odoo server
            label: 'init sync connection',
            condition: function (self) {
                if (self.config.sync_multi_session && !self.config.sync_multi_session_offline) {
                    return true
                } else {
                    return false;
                }
            },
            loaded: function (self) {
                let iot_url = self.session.origin;
                self.iot_connections = [new Session(void 0, iot_url, {
                    use_cors: true
                })];
            },
        },
    ]);

    exports.pos_bus = Backbone.Model.extend({
        initialize: function (pos) {
            this.pos = pos;
            this.pos.sync_status = false;
            this.queue_sync_order_line_by_uid = {};
            this.lines_missed_by_order_uid = {};
            this.requests_printers = []
            this.syncing();
            this.open_kitchen_and_kitchen_waiter_screen();
        },
        set_online: function () {
            const self = this;
            this.pos.sync_status = true;
            this.last_offline = false;
            self.pos.set('syncStatus', {status: 'connected', pending: 'Sync'});
        },
        set_offline: function (total_error) {
            const self = this;
            this.last_offline = true;
            if (!total_error) {
                total_error = 1
            }
            this.pos.set('syncStatus', {
                status: 'disconnected',
                pending: 'Sync '
            });
            this.pos.sync_status = false;
            setTimeout(function () {
                self.syncing()
            }, 2000)

        },
        syncing() {
            let self = this;
            if (this.pos.iot_https_need_verify && this.pos.iot_https_need_verify.length) {
                let needValidate = false;
                for (let i = 0; i < this.pos.iot_https_need_verify.length; i++) {
                    let iotLink = this.pos.iot_https_need_verify[i];
                    if (iotLink.split(':')[0] == 'https') {
                        needValidate = true
                        window.open(this.pos.iot_https_need_verify[i], '_blank');

                    }
                }
                this.pos.iot_https_need_verify = [];
                if (needValidate) {
                    this.pos.chrome.showPopup('ConfirmPopup', {
                        title: _t('Warning'),
                        body: _t('Please accept request of POSBOX link if build on HTTPS for sync between Session can working. Looking new tab we just Opened'),
                        disableCancelButton: true,
                    })
                }
            }
            let pending = 0

            async function waitSync() {
                self.sync_lines();
                if (!self.pos.config.sync_multi_session) {
                    pending += 1
                    self.pos.set('syncStatus', {
                        status: 'disconnected',
                        pending: '[Syncing Pending] ' + pending + ' seconds'
                    });
                    return setTimeout(function () {
                        waitSync()
                    }, 1000)
                } else {
                    pending = 0
                }
                for (let i = 0; i < self.pos.iot_connections.length; i++) {
                    let iot_connection = self.pos.iot_connections[i];
                    let params = {
                        database: self.pos.session.db,
                        config_id: self._build_send_from(),
                        config_ids: self._build_send_to(),
                    };
                    let sending = function () {
                        return iot_connection.rpc("/pos/register/sync", params, {shadow: true, timeout: 7500});
                    };
                    let results = await sending().then(function (results) {
                        return results
                    }, function (error) {
                        let datas_false = self.pos.db.get_datas_false();
                        self.set_offline(datas_false.length);
                        console.error(error)
                        return Promise.reject(error);
                    })
                    if (results) {
                        self.set_online();
                        self.repush_to_another_sessions();
                        let notifications = JSON.parse(results)['values'];
                        if (notifications.length > 0) {
                            const requests_printer = notifications.filter((n) => n['action'] == 'request_printer')
                            const requests_transfer_succeed = notifications.filter((n) => n['action'] == 'transfer_succeed_receipt')
                            let requests_normal = notifications.filter((n) => n['action'] != 'request_printer' && n['action'] != 'transfer_succeed_receipt')
                            console.log('[Total requests_normal] ' + requests_normal.length)
                            console.log('[Total requests_printer] ' + requests_printer.length)
                            console.log('[Total requests_transfer_succeed] ' + requests_transfer_succeed.length)
                            if (requests_normal.length > 0) {
                                for (let i = 0; i < requests_normal.length; i++) {
                                    self.pos.get_notifications(requests_normal[i]);
                                }
                            }
                            for (let i = 0; i < requests_printer.length; i++) {
                                self.pos.get_notifications(requests_printer[i])
                            }
                            for (let i = 0; i < requests_transfer_succeed.length; i++) {
                                self.pos.get_notifications(requests_transfer_succeed[i])
                            }
                        }
                    }
                }
                let timeout = 3000
                if (self.pos.config.sync_multi_session_offline) {
                    timeout = 500
                }
                setTimeout(function () {
                    waitSync()
                }, timeout)
            }

            waitSync()
        },
        open_kitchen_and_kitchen_waiter_screen: function () { // TODO: Open chef screen for IoT Boxes
            for (let i = 0; i < this.pos.iot_connections.length; i++) { //
                let iot_connection = this.pos.iot_connections[i];
                if (iot_connection['screen_kitchen']) {
                    let params = {
                        database: this.pos.session.db,
                        link: iot_connection['odoo_public_proxy'],
                        login: iot_connection['login_kitchen'],
                        password: iot_connection['password_kitchen']
                    };
                    let sending = function () {
                        return iot_connection.rpc("/pos/display-chef-screen", params, {shadow: true});
                    };
                    sending().then(function (result) {
                        console.log(result);
                    }, function (err) {
                        console.error(err)
                    })
                }
            }
        },
        sync_all_orders: function () {
            if (this.pos.the_first_load) {
                return;
            }
            let orders = this.pos.get('orders').models;
            if (orders.length == 0) {
                return
            }
            for (let i = 0; i < orders.length; i++) {
                if (orders[i].get_allow_sync()) {
                    let order = orders[i];
                    this.send_notification({
                        data: order.export_as_JSON(),
                        action: 'new_order',
                        order_uid: order.uid,
                    });
                }
            }
        },
        _build_send_from: function () {
            if (!this.pos.config.multi_user) {
                return this.pos.config.id
            } else {
                return this.pos.config.id + '_' + this.pos.employee.id
            }
        },
        _build_send_to: function () {
            if (!this.pos.config.multi_user) {
                return this.pos.config.sync_to_pos_config_ids
            } else {
                let sync_to_pos_config_ids = [];
                this.pos.config.sync_to_pos_config_ids = this.pos.config.sync_to_pos_config_ids.concat(this.pos.config.id)
                for (let i = 0; i < this.pos.config.sync_to_pos_config_ids.length; i++) {
                    let config_id = this.pos.config.sync_to_pos_config_ids[i];
                    let employee_ids = this.pos.multi_employee_ids_by_config_id[config_id]
                    if (employee_ids) {
                        for (let n = 0; n < employee_ids.length; n++) {
                            let employee_id = employee_ids[n];
                            if (this.pos.employee.id != employee_id) {
                                sync_to_pos_config_ids.push(config_id + '_' + employee_id)
                            }
                        }
                    }
                }
                return sync_to_pos_config_ids
            }
        },
        send_notification: function (value, send_manual = false) {
            let self = this;
            const action = value.action
            if (this.pos.session.restaurant_order) {
                console.log('{blocked sync from restaurant order}: ' + action)
                return true
            }
            if (!value['order_uid']) {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Order UID for sync between Session is required !')
                })
            }
            if (['paid_order', 'unlink_order'].includes(action)) {
                this.pos.db.save_done_order(value['order_uid'])
            } else {
                if (this.pos.db.get_orders_done().includes(value['order_uid'])) {
                    console.log('[send_notification] ' + value['order_uid'] + ' Removed or Paid before. Stop Sync')
                    return true
                }
            }
            this.pos.set('syncStatus', {
                status: 'connecting',
                pending: 'Sync: ' + action
            })
            if (this.pos.config.sync_to_pos_config_ids.length == 0) {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Your POS Setting not add Sync with POS Locations')
                })
            }
            if (this.pos.user) {
                value['user'] = this.pos.user.name;
            }
            value['device_id'] = this.pos._get_unique_number_pos_session();
            let params = {
                database: this.pos.session.db,
                send_from_config_id: this._build_send_from(),
                config_ids: this._build_send_to(),
                message: value,
            };
            for (let i = 0; i < this.pos.iot_connections.length; i++) { //
                let iot_connection = this.pos.iot_connections[i];
                let sending = function () {
                    return iot_connection.rpc("/pos/save/sync", params, {shadow: true, timeout: 7500});
                };
                sending().then(function () {
                    self.set_online();
                }, function (err) {
                    self.set_offline();
                    self.pos.db.add_datas_false(value); // store to browse cache
                });
                if (value['action'] == 'request_printer') { // TODO: only sync event change to one IoT boxes if not request printer and not set_state
                    continue
                } else {
                    break
                }
            }
        },
        repush_to_another_sessions: function () {
            const self = this;
            const datas_false = this.pos.db.get_datas_false();
            if (datas_false && datas_false.length) {
                console.log('Total Datas waiting sync : ' + datas_false.length);
                for (let i = 0; i < datas_false.length; i++) {
                    let value = datas_false[i];
                    this.send_notification(value);
                    self.pos.db.remove_data_false(value['sequence']);
                }
            }
        },
        sync_lines: function () {
            for (let line_uid in this.queue_sync_order_line_by_uid) {
                if (this.queue_sync_order_line_by_uid[line_uid]) {
                    let value = this.queue_sync_order_line_by_uid[line_uid];
                    this.send_notification(value);
                    delete this.queue_sync_order_line_by_uid[line_uid]
                }
            }
            for (let i = 0; i < this.requests_printers.length; i++) {
                let request = this.requests_printers[i]
                this.send_notification(request);
            }
            this.requests_printers = []
        }
    });

    db.include({
        add_datas_false: function (data) {
            let datas_false = this.load('datas_false', []);
            this.sequence += 1;
            data['sequence'] = this.sequence;
            datas_false.push(data);
            this.save('datas_false', datas_false);
        },
        get_datas_false: function () {
            let datas_false = this.load('datas_false');
            if (datas_false && datas_false.length) {
                return datas_false
            } else {
                return []
            }
        },
        remove_data_false: function (sequence) {
            let datas_false = this.load('datas_false', []);
            let datas_false_new = _.filter(datas_false, function (data) {
                return data['sequence'] !== sequence;
            });
            this.save('datas_false', datas_false_new);
        },
        get_orders_done() {
            return this.load('ordersUidDone', [])
        },
        save_done_order(ordersUidDone) {
            let ordersUidDoneBefore = this.load('ordersUidDone', []);
            if (!ordersUidDoneBefore.includes(ordersUidDone)) {
                ordersUidDoneBefore.push(ordersUidDone)
                this.save('ordersUidDone', ordersUidDoneBefore);
                return true
            } else {
                return false
            }
        }
    });

    let _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {
            let self = this;
            _super_PosModel.initialize.apply(this, arguments);
            this.bind('change:selectedOrder', function () {
                let selectedOrder = self.get_order();
                if (self.pos_bus && self.config && selectedOrder && !selectedOrder.syncing && self.config.screen_type != 'kitchen') {
                    self.pos_bus.send_notification({
                        action: 'selected_order',
                        data: {
                            uid: selectedOrder['uid'],
                            order: selectedOrder.export_as_JSON(),
                        },
                        order_uid: selectedOrder.uid
                    });

                }
            });
        },
        _get_unique_number_pos_session: function () { // TODO: this is unique number base on 1 browse open, we dont care the same config or the same pos session
            return this.pos_session.login_number + '_' + this.config.id;
        },
        load_orders: function () {
            this.the_first_load = true;
            _super_PosModel.load_orders.apply(this, arguments);
            this.the_first_load = false;
        },
        on_removed_order: function (removed_order, index, reason) { // todo: no need change screen when syncing remove order
            // todo: off event keyboard receipt screen
            if (removed_order.syncing == true) {
                return;
            } else {
                _super_PosModel.on_removed_order.apply(this, arguments);
            }
        },
        get_order_by_uid: function (uid) {
            const order = this.get('orders').models.find(o => o.uid == uid);
            if (!order) {
                if (this.chrome) {
                    this.chrome.showNotification(this.env._t('Order') + uid, this.env._t('Has Removed or Paid before'))
                }
                return null
            }
            return order
        },
        get_line_by_uid: function (uid) {
            let orders = this.get('orders').models;
            for (let i = 0; i < orders.length; i++) {
                let order = orders[i];
                let line = _.find(order.orderlines.models, function (line) {
                    return line.uid == uid
                });
                if (line) {
                    return line
                }
            }
            return null;
        },
        get_notifications: function (message) {
            let action = message['action'];
            this.alert_message({
                title: _t('Get Sync Sessions'),
                body: action
            })
            if (action == 'selected_order') {
                this.sync_selected_order(message['data']);
            }
            if (action == 'new_order') {
                this.sync_new_order(message['data']);
            }
            if (action == 'unlink_order' || action == 'paid_order') {
                this.sync_unlink_order(message['data'], action, message['user']);
            }
            if (action == 'line_removing') {
                this.sync_line_removing(message['data']);
            }
            if (action == 'trigger_update_line') {
                this.sync_trigger_update_line(message['data']);
            }
            if (action == 'set_line_note') {
                this.sync_set_line_note(message['data']);
            }
            if (action == 'set_client') {
                this.sync_set_client(message['data']);
            }
            if (action == 'change_pricelist') {
                this.sync_change_pricelist(message['data']);
            }
            if (action == 'lock_order') {
                this.sync_lock_order(message['data']);
            }
            if (action == 'unlock_order') {
                this.sync_unlock_order(message['data']);
            }
            if (action == 'lock_table') {
                this.sync_lock_table(message['data']);
            }
        },
        sync_lock_order: function (uid) {
            let order = this.get_order_by_uid(uid);
            if (order) {
                order.lock = true;
                let current_order = this.get_order();
                if (this.config.lock_order_printed_receipt && current_order && current_order['uid'] == order['uid']) {
                    this.lock_order()
                }
                order.trigger('change', order);
                return true
            }
        },
        sync_unlock_order: function (uid) {
            let order = this.get_order_by_uid(uid);
            if (order) {
                order.lock = false;
                let current_order = this.get_order();
                if (current_order && current_order['uid'] == order['uid']) {
                    this.unlock_order()
                }
                return true
            }
        },
        sync_lock_table: function (data) {
            let table_will_lock = _.find(this.tables, function (tb) {
                return tb.id == data.table_id
            })
            if (table_will_lock) {
                table_will_lock.locked = data.lock;
            }
            const selected_order = this.get_order();
            if (selected_order && selected_order.uid == data.order_uid && data.lock && selected_order.table && selected_order.table.id == table_will_lock.id) {
                this.set_table(null);
            }
            posbus.trigger('refresh:FloorScreen')
        },
        sync_selected_order: function (vals) {
            let order = this.get_order_by_uid(vals['uid']);
            if (!order) {
                this.sync_new_order(vals.order)
                return true
            }
        },
        sync_new_order: function (vals) {
            let order = this.get_order_by_uid(vals['uid']);
            let selected_order = this.get_order();
            let selected_order_uid = null;
            if (selected_order) {
                selected_order_uid = selected_order.uid;
            }
            if (order) {
                this.sync_unlink_order(vals['uid'], 'unlink_order', this.user.name);
            }
            let orders = this.get('orders');
            if (vals.floor_id && vals.table_id) {
                if (this.floors_by_id && this.floors_by_id[vals.floor_id] && this.tables_by_id && this.tables_by_id[vals.table_id]) {
                    let table = this.tables_by_id[vals.table_id];
                    let floor = this.floors_by_id[vals.floor_id];
                    if (table && floor) {
                        this.the_first_load = true;
                        let order = new models.Order({}, {pos: this, json: vals});
                        if (vals['sequence_number']) {
                            order['sequence_number'] = vals['sequence_number']
                        }
                        orders.add(order);
                        order.trigger('change', order);
                        this.the_first_load = false;
                    }
                }
            } else {
                if (this.floors != undefined) {
                    if (this.floors.length > 0) {
                        return null;
                    }
                }
                this.the_first_load = true;
                let order = new models.Order({}, {pos: this, json: vals});
                order.syncing = true;
                if (vals['sequence_number']) {
                    order['sequence_number'] = vals['sequence_number']
                }
                orders.add(order);
                order.trigger('change', order);
                order.syncing = false;
                if (orders.length == 1) {
                    this.set('selectedOrder', order);
                }
                this.the_first_load = false;
            }
            if (this.pos_bus.lines_missed_by_order_uid[vals['uid']]) {
                let lines_missed_sync = this.pos_bus.lines_missed_by_order_uid[vals['uid']];
                for (let i = 0; i < lines_missed_sync.length; i++) {
                    this.sync_trigger_update_line(lines_missed_sync[i])
                }
                this.pos_bus.lines_missed_by_order_uid[vals['uid']] = [];
            }
            if (selected_order_uid && vals['uid'] == selected_order_uid) {
                let selected_order = this.get_order_by_uid(vals['uid']);
                this.set('selectedOrder', order);
            }
        },
        has_pos_restaurant_installed: function () {
            return this.config.module_pos_restaurant && this.config.floor_ids && this.config.floor_ids.length > 0;
        },
        sync_unlink_order: function (uid, action, user) {
            let self = this;
            let has_setting_restaurant = this.has_pos_restaurant_installed();
            let order = this.get_order_by_uid(uid);
            if (order) {
                let selected_order = this.get_order();
                order.syncing = true;
                if (selected_order && selected_order['uid'] == order['uid'] && has_setting_restaurant) {
                    this.chrome.showScreen('FloorScreen');
                }
                this.db.remove_order(order.id);
                order.destroy({'reason': 'abandon'});
                if (selected_order && selected_order['uid'] == order['uid'] && !has_setting_restaurant) {
                    setTimeout(function () {
                        let orders = self.get('orders').models;
                        if (orders.length) {
                            self.set_order(orders[orders.length - 1]);
                        } else {
                            self.add_new_order();
                        }
                    }, 500)
                }
            }
            if (this.config.sync_multi_session_alert_remove_order) {
                this.chrome.showPopup('ErrorPopup', {
                    title: this.env._t('Alert, ') + user + this.env._t(' just removed Order: ' + uid)
                })
            }
        },
        sync_set_client: function (vals) {
            let partner_id = vals['partner_id'];
            let uid = vals['uid'];
            let client = this.db.get_partner_by_id(partner_id);
            let order = this.get_order_by_uid(uid);
            if (!order || order.finalized == true) { // if not order or order final submitted backend, return
                return false;
            }
            if (!partner_id) {
                order.syncing = true;
                order.set_client(null);
                order.syncing = false;
                return order.trigger('change', order)
            }
            if (!client) {
                let self = this;
                return rpc.query({
                    model: 'res.partner',
                    method: 'search_read',
                    args: [[['id', '=', partner_id]]],
                }, {
                    timeout: 30000,
                    shadow: true,
                }).then(function (partners) {
                    if (partners.length == 1) {
                        self.db.add_partners(partners);
                        order.syncing = true;
                        order.set_client(partners[0]);
                        order.trigger('change', order);
                        order.syncing = false;
                    } else {
                        console.errorg('Loading new partner fail networking')
                    }
                }, function (error) {
                    return self.pos.query_backend_fail(error);
                })
            } else {
                order.syncing = true;
                order.set_client(client);
                order.trigger('change', order);
                order.syncing = false;
            }
        },
        sync_change_pricelist: function (vals) {
            let order = this.get_order_by_uid(vals['uid']);
            let pricelist = _.findWhere(this.pricelists, {id: vals['pricelist_id']});
            if (!order || !pricelist) {
                console.log('sync pricelist but have difference pricelist between 2 sessions');
                return null
            }
            if (order && pricelist) {
                order.pricelist = pricelist;
                order.trigger('change', order);
            }
        },
        sync_trigger_update_line: function (vals) {
            let line = this.get_line_by_uid(vals['uid']);
            let order = this.get_order_by_uid(vals['line']['order_uid']);
            let json = vals['line'];
            if (line) {
                line.syncing = true;
                if (json.note) {
                    line.set_line_note(json.note)
                }
                if (json.manager_user_id && this.user_by_id && this.user_by_id[json.manager_user_id]) {
                    line.manager_user = this.user_by_id[json.manager_user_id]
                }
                if (json.base_price) {
                    line.set_unit_price(json.base_price);
                    line.base_price = null;
                }
                if (json.returned_order_line_id) {
                    line.returned_order_line_id = json.returned_order_line_id
                }
                if (json.packaging_id && this.packaging_by_id && this.packaging_by_id[json.packaging_id]) {
                    line.packaging = this.packaging_by_id[json.packaging_id];
                }
                if (json.selected_combo_items) {
                    line.set_dynamic_combo_items(json.selected_combo_items)
                }
                if (json.combo_item_ids && json.combo_item_ids.length) {
                    line.set_combo_bundle_pack(json.combo_item_ids)
                }
                if (json.tag_ids) {
                    let tag_ids = json.tag_ids[0][2];
                    if (tag_ids && tag_ids.length) {
                        line.set_tags(tag_ids)
                    }
                }
                if (json.variant_ids && json.variant_ids.length) {
                    let variant_ids = json.variant_ids[0][2];
                    if (variant_ids) {
                        line.set_variants(variant_ids)
                    }
                }
                if (json.uom_id) {
                    line.uom_id = json.uom_id;
                    let unit = this.units_by_id[json.uom_id];
                    if (unit) {
                        line.product.uom_id = [unit['id'], unit['name']];
                    }
                }
                if (json.lot_ids) {
                    line.lot_ids = json.lot_ids;
                }
                if (json.discount_reason) {
                    line.discount_reason = json.discount_reason
                }
                if (json.price_extra) {
                    line.price_extra = json.price_extra;
                }
                if (json.discount_extra) {
                    line.discount_extra = json.discount_extra
                }
                line.set_quantity(json['qty']);
                line.set_discount(json.discount);
                line.set_unit_price(json.price_unit);
                line.syncing = false;
            } else {
                if (order) {
                    let product_id = vals.line.product_id;
                    let product = this.db.get_product_by_id(product_id);
                    if (!product) {
                        console.log('Product Id: ' + product_id + ' not exist in this session');
                        return false;
                    }
                    order.syncing = true;
                    order.add_orderline(new models.Orderline({}, {pos: this, order: order, json: json}));
                    order.syncing = false;
                } else {
                    if (!this.pos_bus.lines_missed_by_order_uid[json['order_uid']]) {
                        this.pos_bus.lines_missed_by_order_uid[json['order_uid']] = [vals]
                    } else {
                        this.pos_bus.lines_missed_by_order_uid[json['order_uid']] = this.pos_bus.lines_missed_by_order_uid[json['order_uid']].concat(vals)
                    }
                }
            }
        },
        sync_set_line_note: function (vals) {
            let line = this.get_line_by_uid(vals['uid']);
            if (line) {
                line.syncing = true;
                line.set_line_note(vals['note']);
                line.syncing = false;
                return true
            }
        },
        sync_line_removing: function (vals) {
            let line = this.get_line_by_uid(vals['uid']);
            if (line) {
                line.syncing = true;
                line.order.orderlines.remove(line);
                line.order.trigger('change', line.order);
                line.syncing = false;
            }
        },
        session_info: function () {
            let user;
            if (this.get('cashier')) {
                user = this.get('cashier');
            } else {
                user = this.user;
            }
            return {
                'user': {
                    'id': user.id,
                    'name': user.name
                },
                'pos': {
                    'id': this.config.id,
                    'name': this.config.name
                },
                'date': new Date().toLocaleTimeString()
            }
        },
        get_session_info: function () {
            let order = this.get_order();
            if (order) {
                return order.get_session_info();
            }
            return null;
        },
        load_server_data: function () {
            let self = this;
            console.log('load_server_data 3')
            return _super_PosModel.load_server_data.apply(this, arguments).then(function () {
                if (self.config.sync_multi_session && self.iot_connections && self.iot_connections.length) {
                    self.pos_bus = new exports.pos_bus(self);
                    // self.pos_bus.start();
                }
                return true;
            })
        },
    });

    let _super_order = models.Order.prototype;
    models.Order = models.Order.extend({
        initialize: function (attributes, options) {
            let self = this;
            let res = _super_order.initialize.apply(this, arguments);
            if (!this.created_time) {
                this.created_time = new Date().toLocaleTimeString();
            }
            if (this.pos.pos_bus) {
                this.bind('add', function (order) {
                    if (order.get_allow_sync()) {
                        self.pos.pos_bus.send_notification({
                            data: order.export_as_JSON(),
                            action: 'new_order',
                            order_uid: order.uid
                        });
                    }
                });
                this.bind('remove', function (order) {
                    if (order.get_allow_sync() && !self.pos.paid_order) {
                        self.pos.pos_bus.send_notification({
                            data: order.uid,
                            action: 'unlink_order',
                            order_uid: order.uid,
                            user: self.pos.user.name,
                        });
                    }
                });
                this.orderlines.bind('add', function (line) {
                    if (line.get_allow_sync()) {
                        line.trigger_update_line();
                    }
                });
            }
            if (!this.session_info) {
                this.session_info = this.pos.session_info();
            }
            this.bind('remove', function (order) {
                this.saveLogActionOfOrder({
                    'uid': order['uid'],
                    'order_json': order.export_as_JSON(),
                    'action': 'Removed',
                })
            });
            this.bind('add', function (order) {
                this.saveLogActionOfOrder({
                    'uid': order['uid'],
                    'order_json': order.export_as_JSON(),
                    'action': 'Create New',
                })
            });
            return res;
        },

        saveLogActionOfOrder: function (vals) {
            if (!this.pos.config.pos_order_tracking || this.pos.the_first_load) {
                return true
            }
            console.log('saveLogActionOfOrder')
            vals['config_id'] = this.pos.config.id
            vals['session_id'] = this.pos.pos_session.id
            return rpc.query({
                model: 'pos.order.log',
                method: 'saveLogActionOfOrder',
                args: [[], vals]
            }, {
                shadow: true,
                timeout: 60000
            })
        },
        get_order_session_info: function () {
            if (this.session_info) {
                return this.session_info
            } else {
                this.session_info = this.pos.session_info();
                return this.session_info
            }
        },
        init_from_JSON: function (json) {
            this.syncing = json.syncing;
            _super_order.init_from_JSON.apply(this, arguments);
            this.uid = json.uid;
            if (json.session_info) {
                this.session_info = json.session_info;
            }
            if (json.created_time) {
                this.created_time = json.created_time;
            }
            if (json.last_write_date) {
                this.last_write_date = json.last_write_date;
            }
            if (json.session_info) {
                this.session_info = json.session_info;
            } else {
                this.session_info = this.pos.session_info();
            }
            this.syncing = false;
        },
        export_as_JSON: function () {
            let json = _super_order.export_as_JSON.apply(this, arguments);
            if (this.session_info) {
                json.session_info = this.session_info;
            }
            if (this.uid) {
                json.uid = this.uid;
            }
            if (this.temporary) {
                json.temporary = this.temporary;
            }
            if (this.created_time) {
                json.created_time = this.created_time;
            }
            if (this.last_write_date) {
                json.last_write_date = this.last_write_date;
            }
            return json;
        },
        finalize: function () {
            this.pos.paid_order = true;
            _super_order.finalize.apply(this, arguments)
            this.pos.paid_order = false;
            if (this.get_allow_sync()) {
                this.pos.pos_bus.send_notification({
                    data: this.uid,
                    action: 'paid_order',
                    order_uid: this.uid,
                    user: this.pos.user.name,
                });
                if (this.table && this.table.locked) {
                    this.pos_bus.send_notification({
                        data: {
                            order: this.export_as_JSON(),
                            table_id: this.table.id,
                            order_uid: this.uid,
                            lock: false,
                        },
                        action: 'lock_table',
                        order_uid: this.uid,
                    })
                }
            }
            this.saveLogActionOfOrder({
                'uid': this['uid'],
                'order_json': this.export_as_JSON(),
                'action': 'Paid Successfully',
            })
        },
        get_session_info: function () {
            return this.session_info;
        },
        set_client: function (client) {
            let self = this;
            let order = this.pos.get_order();
            let res = _super_order.set_client.apply(this, arguments);
            if (!order) {
                return;
            }
            if (client && client['property_product_pricelist']) {
                let pricelist_id = client['property_product_pricelist'][0];
                let pricelist = _.find(this.pos.pricelists, function (pricelist) {
                    return pricelist['id'] == pricelist_id;
                });
                if ((this.pos.server_version in [11, 12]) && pricelist && !this.is_return) { // we're don't want set price list for order return
                    this.set_pricelist(pricelist)
                }
                if (this.pos.server_version == 10 && pricelist && !this.is_return) { // we're don't want set price list for order return
                    this.set_pricelist_to_order(pricelist)
                }
            }
            if (client && client['property_account_position_id']) { // if client have fiscal position auto change tax amount
                let property_account_position_id = client['property_account_position_id'][0];
                let fiscal_potion = _.find(this.pos.fiscal_positions, function (fiscal) {
                    return fiscal.id == property_account_position_id;
                });
                if (fiscal_potion && order) {
                    order.fiscal_position = fiscal_potion;
                    _.each(order.orderlines.models, function (line) {
                        line.set_quantity(line.quantity);
                    });
                    order.trigger('change');
                }
            }
            if (client && !client['property_account_position_id']) { // if client have not fiscal position, auto reset to default fiscal postion config on pos config
                if (!this.pos.config.fiscal_position_auto_detect) {
                    let default_fiscal_position_id = this.pos.config.default_fiscal_position_id[0];
                    let fiscal_potion = _.find(this.pos.fiscal_positions, function (fiscal) {
                        return fiscal.id == default_fiscal_position_id;
                    });
                    if (fiscal_potion && order) {
                        order.fiscal_position = fiscal_potion;
                        _.each(order.orderlines.models, function (line) {
                            line.set_quantity(line.quantity);
                        });
                        order.trigger('change');
                    }
                } else {
                    rpc.query({
                        model: 'account.fiscal.position',
                        method: 'get_fiscal_position',
                        args: [client['id'], client['id']],
                        context: {}
                    }).then(function (fiscal_potion_id) {
                        let order = self.pos.get_order();
                        let fiscal_potion = _.find(self.pos.fiscal_positions, function (fiscal) {
                            return fiscal.id == fiscal_potion_id;
                        });
                        if (fiscal_potion) {
                            order.fiscal_position = fiscal_potion;
                            _.each(order.orderlines.models, function (line) {
                                line.set_quantity(line.quantity);
                            });
                            order.trigger('change');
                        }
                    })
                }
            }
            if (this.get_allow_sync()) {
                if (client) {
                    this.pos.pos_bus.send_notification({
                        data: {
                            uid: order['uid'],
                            partner_id: client.id
                        },
                        action: 'set_client',
                        order_uid: order.uid,
                    });
                }
                if (!client) {
                    this.pos.pos_bus.send_notification({
                        data: {
                            uid: order['uid'],
                            partner_id: null
                        },
                        action: 'set_client',
                        order_uid: order.uid
                    });
                }
            }
            this.saveLogActionOfOrder({
                'uid': this['uid'],
                'order_json': this.export_as_JSON(),
                'action': 'Set Customer',
            })
            return res;
        },
        get_allow_sync: function () {
            if (this.pos.pos_bus && (this.syncing != true || !this.syncing) && this.pos.pos_bus && this.pos.the_first_load == false) {
                return true
            } else {
                return false
            }
        },
        set_pricelist: function (pricelist) {
            if (!this.is_return) {
                _super_order.set_pricelist.apply(this, arguments);
            } else {
                this.pos.alert_message({
                    title: _t('Warning'),
                    body: _t('This order is return Order, not allow change pricelist. Please remove this order and create new orde')
                })
            }
            if (this.get_allow_sync() && this.uid) {
                this.pos.pos_bus.send_notification({
                    data: {
                        uid: this['uid'],
                        pricelist_id: pricelist['id']
                    },
                    action: 'change_pricelist',
                    order_uid: this.uid,
                });
            }
            return true
        },
    });

    let _super_order_line = models.Orderline.prototype;
    models.Orderline = models.Orderline.extend({
        initialize: function (attr, options) {
            let self = this;
            let res = _super_order_line.initialize.apply(this, arguments);
            if (!this.session_info) {
                this.session_info = this.pos.session_info();
            }
            if (!this.uid) {
                this.uid = this.order.uid + '-' + this.pos.pos_session.login_number + this.pos.config.id + this.pos.user.id + this.id;
            }
            this.order_uid = this.order.uid;
            this.bind('trigger_update_line', function () {
                self.trigger_update_line();
            });
            if (this.pos.pos_bus) {
                this.bind('remove', function () {
                    this.trigger_line_removing();
                })
            }
            this.bind('remove', function () {
                this.order.saveLogActionOfOrder({
                    'uid': this.order['uid'],
                    'order_json': this.order.export_as_JSON(),
                    'action': 'Remove Line',
                })
            });
            return res;
        },
        init_from_JSON: function (json) {
            if (json['pack_lot_ids']) {
                json.pack_lot_ids = [];
            }
            let res = _super_order_line.init_from_JSON.apply(this, arguments);
            this.uid = json.uid;
            this.session_info = json.session_info;
            return res;
        },
        export_as_JSON: function () {
            let json = _super_order_line.export_as_JSON.apply(this, arguments);
            json.uid = this.uid;
            json.session_info = this.session_info;
            json.order_uid = this.order.uid;
            return json;
        },
        merge: function (orderline) {
            _super_order_line.merge.apply(this, arguments);
            orderline.trigger_line_removing();
        },

        get_allow_sync: function () {
            if (this.pos.pos_bus && (!this.syncing || this.syncing == false) && (this.order.syncing == false || !this.order.syncing) && (this.uid && this.order.temporary == false)) {
                return true
            } else {
                return false
            }
        },
        set_line_note: function (note) {
            _super_order_line.set_line_note.apply(this, arguments);
            if (this.get_allow_sync()) {
                this.trigger_update_line();
            }
            this.order.saveLogActionOfOrder({
                'uid': this.order['uid'],
                'order_json': this.order.export_as_JSON(),
                'action': 'Set Line Note',
            })
        },
        set_quantity: function (quantity, keep_price) {
            _super_order_line.set_quantity.apply(this, arguments);
            if (this.get_allow_sync() && quantity != 'remove') {
                this.trigger_update_line();
            }
            this.order.saveLogActionOfOrder({
                'uid': this.order['uid'],
                'order_json': this.order.export_as_JSON(),
                'action': 'Set Quantity',
            })
        },
        set_discount: function (discount) {
            _super_order_line.set_discount.apply(this, arguments);
            if (this.get_allow_sync()) {
                this.trigger_update_line();
            }
            this.order.saveLogActionOfOrder({
                'uid': this.order['uid'],
                'order_json': this.order.export_as_JSON(),
                'action': 'Set Discount',
            })
        },
        set_unit_price: function (price) {
            _super_order_line.set_unit_price.apply(this, arguments);
            if (this.get_allow_sync()) {
                this.trigger_update_line();
            }
        },
        set_tags: function (tag_ids) {
            _super_order_line.set_tags.apply(this, arguments);
            if (this.get_allow_sync()) {
                this.trigger_update_line();
            }
        },
        set_sale_person: function (seller) {
            _super_order_line.set_sale_person.apply(this, arguments);
            if (this.get_allow_sync()) {
                this.trigger_update_line();
            }
        },
        set_variants: function (variant_ids) {
            _super_order_line.set_variants.apply(this, arguments);
            if (this.get_allow_sync()) {
                this.trigger_update_line();
            }
        },
        set_unit: function (uom_id) {
            _super_order_line.set_unit.apply(this, arguments);
            if (this.get_allow_sync()) {
                this.trigger_update_line();
            }
        },
        set_taxes: function (tax_ids) {
            _super_order_line.set_taxes.apply(this, arguments);
            if (this.get_allow_sync()) {
                this.trigger_update_line();
            }
        },
        set_dynamic_combo_items: function (selected_combo_items) {
            _super_order_line.set_dynamic_combo_items.apply(this, arguments);
            if (this.get_allow_sync()) {
                this.trigger_update_line();
            }
        },
        trigger_update_line: function () {
            if (this.get_allow_sync()) {
                this.pos.pos_bus.queue_sync_order_line_by_uid[this.uid] = {
                    action: 'trigger_update_line',
                    data: {
                        uid: this.uid,
                        line: this.export_as_JSON()
                    },
                    order_uid: this.order.uid
                }
            }
        },
        trigger_line_removing: function () {
            if (this.get_allow_sync()) {
                this.pos.pos_bus.queue_sync_order_line_by_uid[this.uid] = {
                    action: 'line_removing',
                    data: {
                        uid: this.uid,
                    },
                    order_uid: this.order.uid
                };
            }
        },
        can_be_merged_with: function (orderline) {
            let merge = _super_order_line.can_be_merged_with.apply(this, arguments);
            if (orderline.seller && this.seller && orderline.seller.id != this.seller.id) {
                return false
            }
            return merge
        },
    });

    return exports;
});
