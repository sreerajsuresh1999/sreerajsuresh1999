odoo.define('pos_retail.big_data', function (require) {

    const models = require('point_of_sale.models');
    const core = require('web.core');
    const _t = core._t;
    const db = require('point_of_sale.DB');
    const indexed_db = require('pos_retail.indexedDB');
    const field_utils = require('web.field_utils');
    const time = require('web.time');
    const retail_db = require('pos_retail.database');
    const bus = require('pos_retail.core_bus');
    const rpc = require('web.rpc');
    const exports = {};
    const {posbus} = require('point_of_sale.utils');
    const Session = require('web.Session');

    const indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB || window.shimIndexedDB;

    if (!indexedDB) {
        window.alert("Your browser doesn't support a stable version of IndexedDB.")
    }

    // TODO: for QRcodeOrderScreen
    const listenEventConfirmPlaceOrderOfUsers = Backbone.Model.extend({
        initialize: function (pos) {
            var self = this;
            this.pos = pos;
        },
        start: function () {
            this.bus = bus.bus;
            this.bus.on("notification", this, this.on_notification);
            this.bus.start_polling();
        },
        on_notification: function (notifications) {
            if (notifications && notifications[0] && notifications[0][1]) {
                for (var i = 0; i < notifications.length; i++) {
                    var channel = notifications[i][0][1];
                    if (channel == 'pos.confirm.place.order') {
                        let uid = notifications[i][1].uid
                        posbus.trigger('user-confirm-place-order', uid)
                    }
                }
            }
        }
    });

    // TODO testing case:
    // 1. create new product/partner backend >> passed
    // 2. update product/partner at backend > passed
    // 3. remove product in backend without product in cart >> passed
    // 4. remove product in backend within product in cart >> passed
    // 5. product operation still update in pos and backend change / remove
    // 6. remove partner in backend
    // 7. remove partner in backend but partner have set in order
    // 8. update partner in backend but partner mode edit on pos

    const _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        initialize: async function (session, attributes) {
            if (attributes && attributes.chrome) {
                this.chrome = attributes.chrome
            }
            let self = this;
            this.deleted = {};
            this.partner_model = null;
            this.product_model = null;
            this.total_products = 0;
            this.total_clients = 0;
            this.load_datas_cache = false;
            this.max_load = 9999;
            this.next_load = 10000;
            this.first_load = 10000;
            this.session = session.env.session;
            this.sequence = 0;
            this.image_by_product_id = {}
            this.product_ids = []
            this.partner_ids = []
            this.model_lock = [];
            this.model_unlock = [];
            this.model_ids = this.session['model_ids'];
            this.start_time = this.session['start_time'];
            this.pos_retail = this.session['pos_retail'];
            this.company_currency_id = this.session['company_currency_id'];
            _super_PosModel.initialize.call(this, session, attributes);
            let fonts = _.find(this.models, function (model) { // TODO: odoo default need 5 seconds load fonts, we dont use font 'Lato','Inconsolata', it reason no need to wait
                return model.label == 'fonts'
            });
            fonts.loaded = function (self) {
                return true;
            };
            for (let i = 0; i < this.models.length; i++) {
                let this_model = this.models[i];
                if (this_model.model && this.model_ids[this_model.model]) {
                    this_model['max_id'] = this.model_ids[this_model.model]['max_id'];
                    this_model['min_id'] = this.model_ids[this_model.model]['min_id'];
                    if (this_model.model == 'product.product' && this_model.fields && this_model.fields.length) {
                        this.product_model = this_model;
                        this.model_lock.push(this_model);
                    }
                    if (this_model.model == 'res.partner' && this_model.fields) {
                        this.model_lock.push(this_model);
                        this.partner_model = this_model;
                    }
                } else {
                    this.model_unlock.push(this_model);
                }
            }
            // locked loyalty of odoo ee
            this.model_unlock.filter(model => model.model && model.model != 'loyalty.program')
            if (this.product_model && this.partner_model) {
                let models = {
                    'product.product': {
                        fields: this.product_model.fields,
                        domain: this.product_model.domain,
                        context: this.product_model.context,
                    },
                    'res.partner': {
                        fields: this.partner_model.fields,
                        domain: this.partner_model.domain,
                        context: this.partner_model.context,
                    }
                };
                for (let i = 0; i < this.model_unlock.length; i++) {
                    let model = this.model_unlock[i];
                    if (!model.model) {
                        continue
                    }
                    if (['sale.order', 'sale.order.line', 'pos.order', 'pos.order.line', 'account.move', 'account.move.line'].indexOf(model.model) != -1) {
                        models[model.model] = {
                            fields: model.fields,
                            domain: [],
                            context: {},
                        }
                    }
                }
                this.rpc({
                    model: 'pos.cache.database',
                    method: 'save_parameter_models_load',
                    args: [[], models]
                }, {
                    shadow: true,
                    timeout: 60000
                }).then(function (reinstall) {
                    console.log('[save_parameter_models_load]  ' + reinstall);
                }, function (err) {
                    console.error(err);
                });
            }
            this.models = this.model_unlock;
            let pos_session_object = this.get_model('pos.session');
            if (pos_session_object) {
                pos_session_object.fields.push('required_reinstall_cache')
            }
            this.indexed_db = new indexed_db(self.session);
        },

        async getDatasByModel(model, domain, fields, context) {
            const object = this.get_model(model);
            if (!fields) {
                fields = object.fields
            }
            let results = await rpc.query({
                model: model,
                method: 'search_read',
                domain: domain,
                fields: fields,
                context: context
            }, {
                shadow: true,
                timeout: 65000
            })
            return results
        },

        async getAccountMoves() {
            this.alert_message({
                title: _t('Syncing'),
                body: _t('Account Invoices')
            })
            const model = this.get_model('account.move');
            const params = {
                model: 'account.move',
                fields: model.fields,
                domain: [['company_id', '=', this.company.id]],
                context: {
                    'pos_config_id': this.config.id
                }
            }
            this.saveMoves(await this.getDatasByModel(params['model'], params['domain'], params['fields'], params['context']))
            this.db.save_invoice_lines(await this.getAccountMoveLines())
        },

        async getAccountMoveLines() {
            const self = this
            const model = self.get_model('account.move.line');
            const params = {
                model: 'account.move.line',
                fields: model.fields,
                domain: [['move_id', 'in', this.invoice_ids]],
                context: {
                    'pos_config_id': this.config.id
                }
            }
            return await this.getDatasByModel(params['model'], params['domain'], params['fields'], params['context'])
        },

        saveMoves(invoices) {
            this.invoice_ids = []
            for (let i = 0; i < invoices.length; i++) {
                this.invoice_ids.push(invoices[i]['id']);
            }
            this.db.save_invoices(invoices);
        },

        async getSaleOrders() {
            this.alert_message({
                title: _t('Syncing'),
                body: _t('Sale Orders')
            })
            const self = this;
            const model = self.get_model('sale.order');
            const params = {
                model: 'sale.order',
                fields: model.fields,
                domain: [],
                context: {
                    'pos_config_id': this.config.id
                }
            }
            this.saveSaleOrders(await this.getDatasByModel(params['model'], params['domain'], params['fields'], params['context']))
            await this.getSaleOrderLines()
        },

        async getSaleOrderLines() {
            const self = this
            const model = self.get_model('sale.order.line');
            const params = {
                model: 'sale.order.line',
                fields: model.fields,
                domain: [['order_id', 'in', this.booking_ids]],
                context: {
                    'pos_config_id': this.config.id
                }
            }
            this.saveSaleOrderLines(await this.getDatasByModel(params['model'], params['domain'], params['fields'], params['context']))
        },


        saveSaleOrders(orders) {
            if (!this.booking_ids) {
                this.booking_ids = [];
            }
            for (let i = 0; i < orders.length; i++) {
                let order = orders[i]
                if (!this.booking_ids.includes(order.id)) {
                    this.booking_ids.push(order.id)
                }
                let create_date = field_utils.parse.datetime(order.create_date);
                order.create_date = field_utils.format.datetime(create_date);
                let date_order = field_utils.parse.datetime(order.date_order);
                order.date_order = field_utils.format.datetime(date_order);
                if (order.reserve_from) {
                    let reserve_from = field_utils.parse.datetime(order.reserve_from);
                    order.reserve_from = field_utils.format.datetime(reserve_from);
                }
                if (order.reserve_to) {
                    let reserve_to = field_utils.parse.datetime(order.reserve_to);
                    order.reserve_to = field_utils.format.datetime(reserve_to);
                }
            }
            this.db.save_sale_orders(orders);
        },

        saveSaleOrderLines(order_lines) {
            if (!this.order_lines) {
                this.order_lines = order_lines;
            } else {
                this.order_lines = this.order_lines.concat(order_lines);
                order_lines.forEach(l => {
                    this.order_lines = this.order_lines.filter(sol => sol.id != l.id)
                    this.order_lines.push(l)
                })
            }
            this.db.save_sale_order_lines(order_lines);
        },

        async getPosOrders() {
            this.alert_message({
                title: _t('Syncing'),
                body: _t('POS Orders')
            })
            const model = this.get_model('pos.order');
            const params = {
                model: 'pos.order',
                fields: model.fields,
                domain: model.domain,
                context: {
                    'pos_config_id': this.config.id
                }
            }
            this.savePosOrders(await this.getDatasByModel(params['model'], params['domain'], params['fields'], params['context']))
            await this.getPosOrderLines()
            await this.getPosPayments()
        },

        async getPosOrderLines() {
            const self = this;
            const model = self.get_model('pos.order.line');
            const params = {
                model: 'pos.order.line',
                fields: model.fields,
                domain: [['order_id', 'in', this.order_ids]],
                context: {
                    'pos_config_id': this.config.id
                }
            }
            this.savePosOrderLines(await this.getDatasByModel(params['model'], params['domain'], params['fields'], params['context']))
        },

        async getPosPayments() {
            const self = this;
            const model = self.get_model('pos.payment');
            const params = {
                model: model.model,
                fields: model.fields,
                domain: [['pos_order_id', 'in', this.order_ids]],
                context: {
                    'pos_config_id': this.config.id
                }
            }
            let payments = await this.getDatasByModel(params['model'], params['domain'], params['fields'], params['context'])
            for (let i = 0; i < payments.length; i++) {
                let payment = payments[i]
                let payment_date = field_utils.parse.datetime(payment.payment_date);
                payment.payment_date = field_utils.format.datetime(payment_date);
                let order_id = payment.pos_order_id[0]
                let order = this.db.order_by_id[order_id]
                order['payments'].push(payment)
            }
            return payments
        },

        savePosOrders(orders) {
            this.order_ids = [];
            for (let i = 0; i < orders.length; i++) {
                let order = orders[i];
                let create_date = field_utils.parse.datetime(order.create_date);
                order.create_date = field_utils.format.datetime(create_date);
                let date_order = field_utils.parse.datetime(order.date_order);
                order.date_order = field_utils.format.datetime(date_order);
                this.order_ids.push(order.id)
            }
            this.db.save_pos_orders(orders);
        },

        savePosOrderLines(order_lines) {
            this.orderline_ids = []
            this.db.save_pos_order_line(order_lines);
            for (let i = 0; i < order_lines.length; i++) {
                this.orderline_ids.push(order_lines[i]['id'])
            }
        },

        removeProductHasDeletedOutOfCart: function (product_id) {
            let orders = this.get('orders').models;
            for (let n = 0; n < orders.length; n++) {
                let order = orders[n];
                for (let i = 0; i < order.orderlines.models.length; i++) {
                    let line = order.orderlines.models[i];
                    if (line.product.id == product_id) {
                        order.remove_orderline(line);
                    }
                }
            }
        },
        update_customer_in_cart: function (partner_datas) {
            this.the_first_load = true;
            let orders = this.get('orders').models;
            for (let i = 0; i < orders.length; i++) {
                let order = orders[i];
                let client_order = order.get_client();
                if (!client_order || order.finalized) {
                    continue
                }
                for (let n = 0; n < partner_datas.length; n++) {
                    let partner_data = partner_datas[n];
                    if (partner_data['id'] == client_order.id) {
                        let client = this.db.get_partner_by_id(client_order.id);
                        order.set_client(client);
                    }
                }
            }
            this.the_first_load = false;
        },
        remove_partner_deleted_outof_orders: function (partner_id) {
            let orders = this.get('orders').models;
            let order = orders.find(function (order) {
                let client = order.get_client();
                if (client && client['id'] == partner_id) {
                    return true;
                }
            });
            if (order) {
                order.set_client(null)
            }
            return order;
        },
        get_model: function (_name) {
            let _index = this.models.map(function (e) {
                return e.model;
            }).indexOf(_name);
            if (_index > -1) {
                return this.models[_index];
            }
            return false;
        },
        sort_by: function (field, reverse, primer) {
            let key = primer ?
                function (x) {
                    return primer(x[field])
                } :
                function (x) {
                    return x[field]
                };
            reverse = !reverse ? 1 : -1;
            return function (a, b) {
                return a = key(a), b = key(b), reverse * ((a > b) - (b > a));
            }
        },
        _get_active_pricelist: function () {
            let current_order = this.get_order();
            let default_pricelist = this.default_pricelist;
            if (current_order && current_order.pricelist) {
                let pricelist = _.find(this.pricelists, function (pricelist_check) {
                    return pricelist_check['id'] == current_order.pricelist['id']
                });
                return pricelist;
            } else {
                if (default_pricelist) {
                    let pricelist = _.find(this.pricelists, function (pricelist_check) {
                        return pricelist_check['id'] == default_pricelist['id']
                    });
                    return pricelist
                } else {
                    return null
                }
            }
        },
        get_process_time: function (min, max) {
            if (min > max) {
                return 1
            } else {
                return (min / max).toFixed(1)
            }
        },

        async getImageProducts() {
            // TODO: loading product images for render product image on product screen
            const self = this
            const datas = await PosIDB.get('productImages')
            if (!datas || datas.length == 0) {
                return await this.getDatasByModel('product.product', [['id', 'in', this.product_ids]], ['image_128']).then(function (datas) {
                    if (!datas) {
                        return false
                    }
                    console.log('LOADED from POSIDB Image of Products: ' + datas.length)
                    for (let i = 0; i < datas.length; i++) {
                        let data = datas[i]
                        self.image_by_product_id[data['id']] = data['image_128']
                    }
                    posbus.trigger('reload-products-screen')
                    PosIDB.set('productImages', datas)
                })
            } else {
                console.log('LOADED from BACKEND Image of Products: ' + datas.length)
                for (let i = 0; i < datas.length; i++) {
                    let data = datas[i]
                    self.image_by_product_id[data['id']] = data['image_128']
                }
                console.log('Render Imgages of Products')
                posbus.trigger('reload-products-screen')
            }
        },

        async getProductPricelistItems() {
            // TODO: loading product pricelist items on background
            const self = this;
            await this.getDatasByModel('product.pricelist.item', [['pricelist_id', 'in', _.pluck(this.pricelists, 'id')]], []).then(function (pricelistItems) {
                if (!pricelistItems) {
                    return false
                }
                console.log('[loaded] Product Pricelist Items: ' + pricelistItems.length)
                const pricelist_by_id = {};
                _.each(self.pricelists, function (pricelist) {
                    pricelist_by_id[pricelist.id] = pricelist;
                });
                _.each(pricelistItems, function (item) {
                    let pricelist = pricelist_by_id[item.pricelist_id[0]];
                    pricelist.items.push(item);
                    item.base_pricelist = pricelist_by_id[item.base_pricelist_id[0]];
                });
                let order = self.get_order();
                let pricelist = self._get_active_pricelist();
                if (order && pricelist) {
                    order.set_pricelist(pricelist);
                }
            })
        },

        reloadPosScreen() {
            const self = this;
            return new Promise(function (resolve, reject) {
                self.rpc({
                    model: 'pos.session',
                    method: 'update_required_reinstall_cache',
                    args: [[self.pos_session.id]]
                }, {
                    shadow: true,
                    timeout: 65000
                }).then(function (state) {
                    self.remove_indexed_db();
                    self.reload_pos();
                    resolve(state);
                }, function (err) {
                    self.remove_indexed_db();
                    self.reload_pos();
                    reject(err)
                })
            });
        },

        getStockDatasByLocationIds(product_ids = [], location_ids = []) {
            return rpc.query({
                model: 'stock.location',
                method: 'getStockDatasByLocationIds',
                args: [[], product_ids, location_ids],
                context: {}
            }, {
                timeout: 7500,
                shadow: true,
            });
        },

        async syncProductsPartners() {
            console.log('[BEGIN] syncProductsPartners')
            const self = this;
            const model_values = this.db.write_date_by_model;
            let args = [];
            args = [[], model_values, this.config.id];
            let results = await this.rpc({
                model: 'pos.cache.database',
                method: 'syncProductsPartners',
                args: args
            }, {
                shadow: true,
                timeout: 75000
            })
            let count_update = 0
            for (let model in results) {
                let vals = results[model];
                for (let i = 0; i < vals.length; i++) {
                    let record = vals[i]
                    if (record.deleted) {
                        self.indexed_db.unlink(model, record);
                    } else {
                        self.indexed_db.write(model, [record]);
                    }
                }
                vals = vals.filter(r => !r['deleted'])
                if (vals && vals.length) {
                    count_update += vals.length
                    self.save_results(model, vals)
                    if (model == 'res.partner') {
                        self.update_customer_in_cart(vals);
                    }
                }
            }
            console.log('Total update from BE: ' + count_update)
        },
        async fetchNewUpdateFromBackEnd() {
            console.log('[BEGIN] fetchNewUpdateFromBackEnd')
            const product_ids = this.db.product_ids
            const partner_ids = this.db.partner_ids
            if (product_ids.length != 0) {
                let productObject = this.get_model('product.product');
                let partnerObject = this.get_model('res.partner');
                let productsMissed = await this.rpc({
                    model: 'product.product',
                    method: 'search_read',
                    domain: [['id', 'not in', product_ids], ['sale_ok', '=', true], ['available_in_pos', '=', true]],
                    fields: productObject.fields
                }, {
                    shadow: true,
                    timeout: 75000
                })
                console.log('[Missed products] ' + productsMissed.length)
                if (productsMissed.length) {
                    this.indexed_db.write('product.product', productsMissed);
                    this.save_results('product.product', productsMissed);
                }
                let partnersMissed = await this.rpc({
                    model: 'res.partner',
                    method: 'search_read',
                    domain: [['id', 'not in', partner_ids]],
                    fields: partnerObject.fields
                }, {
                    shadow: true,
                    timeout: 75000
                })
                console.log('[Missed partners] ' + partnersMissed.length)
                if (partnersMissed.length) {
                    this.indexed_db.write('res.partner', partnersMissed);
                    this.save_results('res.partner', partnersMissed);
                }
            }
            console.log('[END] fetchNewUpdateFromBackEnd')
        },

        save_results: function (model, results) {
            // TODO: When loaded all results from indexed DB, we restore back to POS Odoo
            const recordsRemoved = results.filter(r => r['deleted'])
            if (recordsRemoved && recordsRemoved.length) {
                for (let i = 0; i < recordsRemoved.length; i++) {
                    this.indexed_db.unlink(model, recordsRemoved[i]);
                }
            }
            results = results.filter(r => !r['deleted'])
            if (model == 'product.product') {
                this.total_products += results.length;
                let process_time = this.get_process_time(this.total_products, this.model_ids[model]['count']) * 100;
                console.log('LOADED total products ' + this.total_products)
                this.product_ids = this.product_ids.concat(_.pluck(results, 'id'))
            }
            if (model == 'res.partner') {
                this.total_clients += results.length;
                let process_time = this.get_process_time(this.total_clients, this.model_ids[model]['count']) * 100;
                console.log('LOADED total partners ' + this.total_clients)
                this.partner_ids = this.partner_ids.concat(_.pluck(results, 'id'))
            }
            let object = _.find(this.model_lock, function (object_loaded) {
                return object_loaded.model == model;
            });
            if (object) {
                try {
                    object.loaded(this, results, {})
                } catch (e) {
                    console.error(e)
                }
            } else {
                console.error('Could not find model: ' + model + ' for restoring datas');
                return false;
            }
            this.load_datas_cache = true;
            this.db.set_last_write_date_by_model(model, results);
            this.indexed_db.data_by_model[model] = null

        },
        api_install_datas: function (model_name) {
            let self = this;
            let installed = new Promise(function (resolve, reject) {
                function installing_data(model_name, min_id, max_id) {
                    self.setLoadingMessage(_t('Installing Model: ' + model_name + ' from ID: ' + min_id + ' to ID: ' + max_id));
                    let model = _.find(self.model_lock, function (model) {
                        return model.model == model_name;
                    });
                    let domain = [['id', '>=', min_id], ['id', '<', max_id]];
                    let context = {};
                    if (model['model'] == 'product.product') {
                        domain.push(['available_in_pos', '=', true]);
                        let price_id = null;
                        if (self.pricelist) {
                            price_id = self.pricelist.id;
                        }
                        let stock_location_id = null;
                        if (self.config.stock_location_id) {
                            stock_location_id = self.config.stock_location_id[0]
                        }
                        context['location'] = stock_location_id;
                        context['pricelist'] = price_id;
                        context['display_default_code'] = false;
                    }
                    if (min_id == 0) {
                        max_id = self.max_load;
                    }
                    self.rpc({
                        model: 'pos.cache.database',
                        method: 'install_data',
                        args: [null, model_name, min_id, max_id]
                    }).then(function (results) {
                        min_id += self.next_load;
                        if (typeof results == "string") {
                            results = JSON.parse(results);
                        }
                        if (results.length > 0) {
                            max_id += self.next_load;
                            installing_data(model_name, min_id, max_id);
                            self.indexed_db.write(model_name, results);
                            self.save_results(model_name, results);
                        } else {
                            if (max_id < model['max_id']) {
                                max_id += self.next_load;
                                installing_data(model_name, min_id, max_id);
                            } else {
                                resolve()
                            }
                        }
                    }, function (error) {
                        console.error(error.message.message);
                        let db = self.session.db;
                        for (let i = 0; i <= 100; i++) {
                            indexedDB.deleteDatabase(db + '_' + i);
                        }
                        reject(error)
                    })
                }

                installing_data(model_name, 0, self.first_load);
            });
            return installed;
        },
        remove_indexed_db: function () {
            let dbName = this.session.db;
            for (let i = 0; i <= 50; i++) {
                indexedDB.deleteDatabase(dbName + '_' + i);
            }
            console.log('remove_indexed_db succeed !')
        },

        saveQueryLog(key, result) {
            console.warn('saving log of key: ' + key)
            rpc.query({
                model: 'pos.query.log',
                method: 'updateQueryLogs',
                args: [[], {
                    'key': key,
                    'result': result
                }],
            })
        },

        // TODO: before 20.06.2021
        // load_server_data: function () {
        //     const self = this;
        //     return _super_PosModel.load_server_data.apply(this, arguments).then(function () {
        //         self.models = self.models.concat(self.model_lock);
        //         self.syncProductsPartners()
        //         self.getImageProducts()
        //     });
        // },
        load_server_data_from_cache: async function (refeshCache = false, needLoaded = false) {
            const currentPosSessionId = await PosIDB.get('pos_session_id')
            const queryLogs = this.session.queryLogs
            var self = this;
            var progress = 0;
            var progress_step = 1.0 / self.models.length;
            var tmp = {}; // this is used to share a temporary state between models loaders
            const loaded = new Promise(function (resolve, reject) {
                async function load_model(index) {
                    if (index >= self.models.length) {
                        resolve();
                    } else {
                        var model = self.models[index];
                        var cond = typeof model.condition === 'function' ? model.condition(self, tmp) : true;
                        if (!cond) {
                            load_model(index + 1);
                            return;
                        }
                        if (!refeshCache && !needLoaded) {
                            self.setLoadingMessage(_t('Loading') + ' ' + (model.label || model.model || ''), progress);
                        }
                        var fields = typeof model.fields === 'function' ? model.fields(self, tmp) : model.fields;
                        var domain = typeof model.domain === 'function' ? model.domain(self, tmp) : model.domain;
                        var context = typeof model.context === 'function' ? model.context(self, tmp) : model.context || {};
                        var ids = typeof model.ids === 'function' ? model.ids(self, tmp) : model.ids;
                        var order = typeof model.order === 'function' ? model.order(self, tmp) : model.order;
                        progress += progress_step;
                        if (model.model) {
                            let modelCall = model.model
                            let requestString = JSON.stringify({
                                modelCall,
                                fields,
                                domain,
                                context,
                                ids,
                                order
                            });
                            var params = {
                                model: model.model,
                                context: _.extend(context, self.session.user_context || {}),
                            };

                            if (model.ids) {
                                params.method = 'read';
                                params.args = [ids, fields];
                            } else {
                                params.method = 'search_read';
                                params.domain = domain;
                                params.fields = fields;
                                params.orderBy = order;
                            }
                            model.key = requestString
                            // TODO: refeshCache if active is True, no need get data from cache, it mean only fetch server and save
                            // TODO: never save cache pos config and pos session
                            // TODO: if odoo.pos_session_id change, will refresh cache of local browse
                            if (!refeshCache && currentPosSessionId == odoo.pos_session_id && model.model != 'pos.config' && model.model != 'pos.session' && model.model != 'res.users') {
                                try {
                                    let result = await PosIDB.get(requestString)
                                    if (result == undefined && queryLogs[requestString]) {
                                        result = queryLogs[requestString]
                                    }
                                    if (result != undefined) {
                                        console.warn('Found ( ' + result.length + ' ) of ' + model.model + ' in Browse Cache.')
                                        Promise.resolve(model.loaded(self, result, tmp)).then(function () {
                                                load_model(index + 1);
                                            },
                                            function (err) {
                                                reject(err);
                                            });
                                    } else {
                                        self.rpc(params).then(function (result) {
                                            try { // catching exceptions in model.loaded(...)
                                                if (PosIDB.get('pos_session_id') !== odoo.pos_session_id) {
                                                    PosIDB.set('pos_session_id', odoo.pos_session_id);
                                                    PosIDB.set(requestString, result)
                                                }
                                                self.saveQueryLog(requestString, result)
                                                Promise.resolve(model.loaded(self, result, tmp))
                                                    .then(function () {
                                                            load_model(index + 1);
                                                        },
                                                        function (err) {
                                                            reject(err);
                                                        });
                                            } catch (err) {
                                                console.error(err.message, err.stack);
                                                reject(err);
                                            }
                                        }, function (err) {
                                            reject(err);
                                        });
                                    }

                                } catch (e) {
                                    console.warn('==> has error loading db POS-DB (indexedbd) get datas direct backend')
                                    if (queryLogs[requestString]) {
                                        let result = queryLogs[requestString]
                                        Promise.resolve(model.loaded(self, result, tmp)).then(function () {
                                                load_model(index + 1);
                                            },
                                            function (err) {
                                                reject(err);
                                            });
                                    } else {
                                        self.rpc(params).then(function (result) {
                                            try { // catching exceptions in model.loaded(...)
                                                if (currentPosSessionId == odoo.pos_session_id) {
                                                    PosIDB.set('pos_session_id', odoo.pos_session_id);
                                                    PosIDB.set(requestString, result)
                                                }
                                                self.saveQueryLog(requestString, result)
                                                Promise.resolve(model.loaded(self, result, tmp))
                                                    .then(function () {
                                                            load_model(index + 1);
                                                        },
                                                        function (err) {
                                                            reject(err);
                                                        });
                                            } catch (err) {
                                                console.error(err.message, err.stack);
                                                reject(err);
                                            }
                                        }, function (err) {
                                            reject(err);
                                        });
                                    }
                                }

                            } else {
                                self.rpc(params).then(function (result) {
                                    try { // catching exceptions in model.loaded(...)
                                        PosIDB.set('pos_session_id', odoo.pos_session_id);
                                        PosIDB.set(requestString, result)
                                        self.saveQueryLog(requestString, result)
                                        if (!needLoaded) {
                                            Promise.resolve(model.loaded(self, result, tmp))
                                                .then(function () {
                                                        load_model(index + 1);
                                                    },
                                                    function (err) {
                                                        reject(err);
                                                    });
                                        } else {
                                            Promise.resolve()
                                            load_model(index + 1);
                                        }

                                    } catch (err) {
                                        console.error(err.message, err.stack);
                                        reject(err);
                                    }
                                }, function (err) {
                                    reject(err);
                                });
                            }
                        } else if (model.loaded) {
                            try { // catching exceptions in model.loaded(...)
                                Promise.resolve(model.loaded(self, tmp))
                                    .then(function () {
                                            load_model(index + 1);
                                        },
                                        function (err) {
                                            reject(err);
                                        });
                            } catch (err) {
                                reject(err);
                            }
                        } else {
                            load_model(index + 1);
                        }
                    }
                }

                try {
                    return load_model(0);
                } catch (err) {
                    return Promise.reject(err);
                }
            });
            return loaded.then(function () {
                self.models = self.models.concat(self.model_lock);
                self.session.queryLogs = null
                if (self.config.qrcode_order_screen && self.config.sync_multi_session) {
                    self.listenEventConfirmPlaceOrderOfUsers = new listenEventConfirmPlaceOrderOfUsers(self);
                    self.listenEventConfirmPlaceOrderOfUsers.start();
                }
            });
        },
        load_server_data_from_iot: function (refeshCache = false, needLoaded = false) {
            const self = this;
            var progress = 0;
            var progress_step = 1.0 / self.models.length;
            var tmp = {}; // this is used to share a temporary state between models loaders
            const iotUrl = 'http://' + odoo.proxy_ip + ':8069'
            const iotConnection = new Session(void 0, iotUrl, {
                use_cors: true
            });
            var loaded = new Promise(function (resolve, reject) {
                async function load_model(index) {
                    if (index >= self.models.length) {
                        resolve();
                    } else {
                        var model = self.models[index];
                        var cond = typeof model.condition === 'function' ? model.condition(self, tmp) : true;
                        if (!cond) {
                            load_model(index + 1);
                            return;
                        }
                        if (!refeshCache && !needLoaded) {
                            self.setLoadingMessage(_t('Loading') + ' ' + (model.label || model.model || ''), progress);
                        }

                        var fields = typeof model.fields === 'function' ? model.fields(self, tmp) : model.fields;
                        var domain = typeof model.domain === 'function' ? model.domain(self, tmp) : model.domain;
                        var context = typeof model.context === 'function' ? model.context(self, tmp) : model.context || {};
                        var ids = typeof model.ids === 'function' ? model.ids(self, tmp) : model.ids;
                        var order = typeof model.order === 'function' ? model.order(self, tmp) : model.order;
                        progress += progress_step;

                        if (model.model) {
                            var params = {
                                model: model.model,
                                context: _.extend(context, self.session.user_context || {}),
                            };

                            if (model.ids) {
                                params.method = 'read';
                                params.args = [ids, fields];
                            } else {
                                params.method = 'search_read';
                                params.domain = domain;
                                params.fields = fields;
                                params.orderBy = order;
                            }
                            let modelCall = model.model
                            let requestString = JSON.stringify({
                                modelCall,
                                fields,
                                domain,
                                context,
                                ids,
                                order
                            });
                            let cacheResult = null
                            try {
                                cacheResult = await iotConnection.rpc('/hw_cache/get', {key: requestString})
                            } catch (e) {
                                console.error(e)
                            }
                            if (!cacheResult || refeshCache) {
                                self.rpc(params).then(function (result) {
                                    iotConnection.rpc('/hw_cache/save', {key: requestString, value: result})
                                    try { // catching exceptions in model.loaded(...)
                                        if (!needLoaded) {
                                            Promise.resolve(model.loaded(self, result, tmp))
                                                .then(function () {
                                                        load_model(index + 1);
                                                    },
                                                    function (err) {
                                                        reject(err);
                                                    });
                                        } else {
                                            Promise.resolve()
                                            load_model(index + 1);
                                        }

                                    } catch (err) {
                                        console.error(err.message, err.stack);
                                        reject(err);
                                    }
                                }, function (err) {
                                    reject(err);
                                });
                            } else {
                                try { // catching exceptions in model.loaded(...)
                                    if (!needLoaded) {
                                        Promise.resolve(model.loaded(self, cacheResult, tmp))
                                            .then(function () {
                                                    load_model(index + 1);
                                                },
                                                function (err) {
                                                    reject(err);
                                                });
                                    } else {
                                        Promise.resolve()
                                        load_model(index + 1);
                                    }
                                } catch (err) {
                                    console.error(err.message, err.stack);
                                    reject(err);
                                }
                            }
                        } else if (model.loaded) {
                            try { // catching exceptions in model.loaded(...)
                                Promise.resolve(model.loaded(self, tmp))
                                    .then(function () {
                                            load_model(index + 1);
                                        },
                                        function (err) {
                                            reject(err);
                                        });
                            } catch (err) {
                                reject(err);
                            }
                        } else {
                            load_model(index + 1);
                        }
                    }
                }

                try {
                    return load_model(0);
                } catch (err) {
                    return Promise.reject(err);
                }
            });
            return loaded.then(function () {
                self.models = self.models.concat(self.model_lock);
                if (self.config.qrcode_order_screen && self.config.sync_multi_session) {
                    self.listenEventConfirmPlaceOrderOfUsers = new listenEventConfirmPlaceOrderOfUsers(self);
                    self.listenEventConfirmPlaceOrderOfUsers.start();
                }
            });
        },
        // TODO: after 20.06.2021, use cached all request to Browse DB
        load_server_data: function (refeshCache = false, needLoaded = false) {
            console.log('--***--   BEGIN load_server_data ---***---')
            const self = this;
            if (odoo.cache != 'browse' && odoo.cache != 'iot') {
                return _super_PosModel.load_server_data.apply(this, arguments).then(function () {
                    self.models = self.models.concat(self.model_lock);
                });
            }
            console.log('[POS Config] active cache feature !!!')
            console.log('cache type: ' + odoo.cache)
            if (odoo.cache == 'iot') {
                return this.load_server_data_from_iot(refeshCache, needLoaded)
            } else {
                return this.load_server_data_from_cache(refeshCache, needLoaded)
            }

        },
    });
    db.include({
        init: function (options) {
            this._super(options);
            this.write_date_by_model = {};
            this.products_removed = [];
            this.partners_removed = [];
        },
        set_last_write_date_by_model: function (model, results) {
            /* TODO: this method overide method set_last_write_date_by_model of Databse.js
                We need to know last records updated (change by backend clients)
                And use field write_date compare datas of pos and datas of backend
                We are get best of write date and compare
             */
            this.product_max_id = 0
            for (let i = 0; i < results.length; i++) {
                let line = results[i];
                if (!this.write_date_by_model[model]) {
                    this.write_date_by_model[model] = line.write_date;
                    this.product_max_id = line['id']
                    continue;
                }
                if (this.write_date_by_model[model] != line.write_date && new Date(this.write_date_by_model[model]).getTime() < new Date(line.write_date).getTime()) {
                    this.write_date_by_model[model] = line.write_date;
                    this.product_max_id = line['id']
                }
            }
            if (this.write_date_by_model[model] == undefined) {
                console.warn('[BigData.js] Datas of model ' + model + ' not found!')
            }
        },
        search_product_in_category: function (category_id, query) {
            let self = this;
            let results = this._super(category_id, query);
            results = _.filter(results, function (product) {
                return self.products_removed.indexOf(product['id']) == -1
            });
            return results;
        },
        get_product_by_category: function (category_id) {
            let self = this;
            let list = this._super(category_id);
            if (category_id == 0) {
                list = this.getAllProducts(this.limit)
            }
            list = _.filter(list, function (product) {
                return self.products_removed.indexOf(product['id']) == -1
            });
            if (window.posmodel.config.default_product_sort_by == 'a_z') {
                list = list.sort(window.posmodel.sort_by('display_name', false, function (a) {
                    if (!a) {
                        a = 'N/A';
                    }
                    return a.toUpperCase()
                }));
            } else if (window.posmodel.config.default_product_sort_by == 'z_a') {
                list = list.sort(window.posmodel.sort_by('display_name', true, function (a) {
                    if (!a) {
                        a = 'N/A';
                    }
                    return a.toUpperCase()
                }));
            } else if (window.posmodel.config.default_product_sort_by == 'low_price') {
                list = list.sort(window.posmodel.sort_by('lst_price', false, parseInt));
            } else if (window.posmodel.config.default_product_sort_by == 'high_price') {
                list = list.sort(window.posmodel.sort_by('lst_price', true, parseInt));
            } else if (window.posmodel.config.default_product_sort_by == 'pos_sequence') {
                list = list.sort(window.posmodel.sort_by('pos_sequence', true, parseInt));
            }
            return list;
        },
        search_partner: function (query) {
            let self = this;
            let results = this._super(query);
            results = _.filter(results, function (partner) {
                return self.partners_removed.indexOf(partner['id']) == -1
            });
            return results;
        },
        get_partners_sorted: function (max_count) {
            // TODO: improved performace to big data partners , default odoo get 1000 rows, but we only allow default render 20 rows
            if (max_count && max_count >= 20) {
                max_count = 20;
            }
            let self = this;
            let results = this._super(max_count);
            results = _.filter(results, function (partner) {
                return self.partners_removed.indexOf(partner['id']) == -1
            });
            return results;
        },
    });

    models.load_models([
        {
            label: 'Reload Session',
            condition: function (self) {
                return self.pos_session.required_reinstall_cache;
            },
            loaded: function (self) {
                return self.reloadPosScreen()
            },
        },
        {
            label: 'Ping Cache Server',
            condition: function (self) {
                return odoo.cache == 'iot';
            },
            loaded: function (self) {
                const iotUrl = 'http://' + odoo.proxy_ip + ':8069'
                const iotConnection = new Session(void 0, iotUrl, {
                    use_cors: true
                });
                return iotConnection.rpc('/hw_cache/ping', {}).then(function (result) {
                    if (result == 'ping') {
                        console.log('Cache Server is running')
                    }
                }, function (error) {
                    alert('Could not connect to IOT IP Address:' + iotUrl)
                })
            },
        },
    ], {
        after: 'pos.config'
    });

    models.load_models([
        {
            label: 'Stock Production Lot',
            model: 'stock.production.lot',
            fields: ['name', 'ref', 'product_id', 'product_uom_id', 'create_date', 'product_qty', 'barcode', 'replace_product_public_price', 'public_price', 'expiration_date'],
            lot: true,
            domain: function (self) {
                return []
            },
            loaded: function (self, lots) {
                lots = lots.filter(l => {
                    if (!l['expiration_date'] || (l['expiration_date'] >= time.date_to_str(new Date()) + " " + time.time_to_str(new Date()))) {
                        return true
                    } else {
                        return false
                    }
                })
                self.lots = lots;
                self.lot_by_name = {};
                self.lot_by_id = {};
                self.lot_by_product_id = {};
                for (let i = 0; i < self.lots.length; i++) {
                    let lot = self.lots[i];
                    self.lot_by_name[lot['name']] = lot;
                    self.lot_by_id[lot['id']] = lot;
                    if (!self.lot_by_product_id[lot.product_id[0]]) {
                        self.lot_by_product_id[lot.product_id[0]] = [lot];
                    } else {
                        self.lot_by_product_id[lot.product_id[0]].push(lot);
                    }
                }
            }
        },
        {
            label: 'Products & Partners',
            installed: true,
            loaded: async function (self) {
                await self.indexed_db.get_datas('product.product', 10)
                await self.indexed_db.get_datas('res.partner', 10)
                const products = self.indexed_db.data_by_model['product.product']
                if (products) {
                    await self.save_results('product.product', products)
                }
                const partners = self.indexed_db.data_by_model['res.partner']
                if (partners) {
                    await self.save_results('res.partner', partners)
                }
                await self.syncProductsPartners()
                await self.getImageProducts()
            }
        },
    ], {
        after: 'res.currency'
    });

    models.load_models([
        {
            label: 'Installing Products',
            condition: function (self) {
                return self.total_products == 0;
            },
            loaded: function (self) {
                self.first_install_cache = true
                return self.api_install_datas('product.product')
            }
        },
        {
            label: 'Installing Partners',
            condition: function (self) {
                return self.total_clients == 0;
            },
            loaded: function (self) {
                return self.api_install_datas('res.partner')
            }
        },
        {
            label: 'Image Products',
            condition: function (self) {
                return self.first_install_cache
            },
            loaded: async function (self) {
                await self.getImageProducts()
            }
        },
        {
            label: 'POS Orders',
            model: 'pos.order',
            context: function (self) {
                return {pos_config_id: self.config.id}
            },
            fields: [
                'create_date',
                'name',
                'date_order',
                'user_id',
                'amount_tax',
                'amount_total',
                'amount_paid',
                'amount_return',
                'pricelist_id',
                'partner_id',
                'sequence_number',
                'session_id',
                'state',
                'account_move',
                'picking_ids',
                'picking_type_id',
                'location_id',
                'note',
                'nb_print',
                'pos_reference',
                'payment_journal_id',
                'fiscal_position_id',
                'ean13',
                'expire_date',
                'is_return',
                'is_returned',
                'voucher_id',
                'email',
                'write_date',
                'config_id',
                'is_paid_full',
                'partial_payment',
                'session_id',
                'shipping_id',
            ],
            domain: function (self) {
                let domain = [];
                return domain
            },
            loaded: function (self, orders) {
                self.savePosOrders(orders)
            }
        }, {
            label: 'POS Order Lines',
            model: 'pos.order.line',
            fields: [
                'name',
                'notice',
                'product_id',
                'price_unit',
                'qty',
                'price_subtotal',
                'price_subtotal_incl',
                'discount',
                'order_id',
                'plus_point',
                'redeem_point',
                'promotion',
                'promotion_reason',
                'is_return',
                'uom_id',
                'user_id',
                'note',
                'discount_reason',
                'create_uid',
                'write_date',
                'create_date',
                'config_id',
                'variant_ids',
                'returned_qty',
                'pack_lot_ids',
            ],
            domain: function (self) {
                return [['order_id', 'in', self.order_ids]]
            },
            loaded: function (self, order_lines) {
                self.savePosOrderLines(order_lines)
            }
        }, {
            label: 'POS Payment',
            model: 'pos.payment',
            fields: [
                'payment_date',
                'pos_order_id',
                'amount',
                'payment_method_id',
                'name',
            ],
            domain: function (self) {
                return [['pos_order_id', 'in', self.order_ids]]
            },
            loaded: function (self, payments) {
                for (let i = 0; i < payments.length; i++) {
                    let payment = payments[i]
                    let payment_date = field_utils.parse.datetime(payment.payment_date);
                    payment.payment_date = field_utils.format.datetime(payment_date);
                    let order_id = payment.pos_order_id[0]
                    let order = self.db.order_by_id[order_id]
                    order['payments'].push(payment)
                }
            }
        }, {
            label: 'POS Pack Operation Lot',
            model: 'pos.pack.operation.lot',
            fields: [
                'lot_name',
                'pos_order_line_id',
                'product_id',
                'lot_id',
                'quantity',
            ],
            domain: function (self) {
                return [['pos_order_line_id', 'in', self.orderline_ids]]
            },
            condition: function (self) {
                return self.config.pos_orders_management;
            },
            loaded: function (self, pack_operation_lots) {
                self.pack_operation_lots = pack_operation_lots;
                self.pack_operation_lots_by_pos_order_line_id = {};
                for (let i = 0; i < pack_operation_lots.length; i++) {
                    let pack_operation_lot = pack_operation_lots[i];
                    if (!pack_operation_lot.pos_order_line_id) {
                        continue
                    }
                    if (!self.pack_operation_lots_by_pos_order_line_id[pack_operation_lot.pos_order_line_id[0]]) {
                        self.pack_operation_lots_by_pos_order_line_id[pack_operation_lot.pos_order_line_id[0]] = [pack_operation_lot]
                    } else {
                        self.pack_operation_lots_by_pos_order_line_id[pack_operation_lot.pos_order_line_id[0]].push(pack_operation_lot)
                    }
                }
            }
        }, {
            label: 'Sale Orders',
            model: 'sale.order',
            fields: [
                'create_date',
                'pos_config_id',
                'pos_location_id',
                'name',
                'origin',
                'client_order_ref',
                'state',
                'date_order',
                'validity_date',
                'user_id',
                'partner_id',
                'pricelist_id',
                'invoice_ids',
                'partner_shipping_id',
                'payment_term_id',
                'note',
                'amount_tax',
                'amount_total',
                'picking_ids',
                'delivery_address',
                'delivery_date',
                'delivery_phone',
                'book_order',
                'payment_partial_amount',
                'payment_partial_method_id',
                'write_date',
                'ean13',
                'pos_order_id',
                'write_date',
                'reserve_order',
                'reserve_from',
                'reserve_to',
                'reserve_table_id',
                'reserve_no_of_guests',
                'reserve_mobile',
                'ean13',
                'pos_order_id',
            ],
            domain: function (self) {
                let domain = [];
                return domain
            },
            context: function (self) {
                return {pos_config_id: self.config.id}
            },
            loaded: function (self, orders) {
                self.saveSaleOrders(orders)
            }
        }, {
            model: 'sale.order.line',
            fields: [
                'name',
                'discount',
                'product_id',
                'order_id',
                'price_unit',
                'price_subtotal',
                'price_tax',
                'price_total',
                'product_uom',
                'product_uom_qty',
                'qty_delivered',
                'qty_invoiced',
                'tax_id',
                'variant_ids',
                'state',
                'write_date'
            ],
            domain: function (self) {
                return [['order_id', 'in', self.booking_ids]]
            },
            context: {'pos': true},
            loaded: function (self, order_lines) {
                self.saveSaleOrderLines(order_lines)
            }
        },
        {
            model: 'account.move',
            fields: [
                'create_date',
                'name',
                'date',
                'ref',
                'state',
                'move_type',
                'auto_post',
                'journal_id',
                'partner_id',
                'amount_tax',
                'amount_total',
                'amount_untaxed',
                'amount_residual',
                'invoice_user_id',
                'payment_reference',
                'payment_state',
                'invoice_date',
                'invoice_date_due',
                'invoice_payment_term_id',
                'stock_move_id',
                'write_date',
                'currency_id',
            ],
            domain: function (self) {
                let domain = [['company_id', '=', self.company.id]];
                return domain
            },
            context: function (self) {
                return {pos_config_id: self.config.id}
            },
            loaded: function (self, moves) {
                self.saveMoves(moves)
            },
            retail: true,
        },
        {
            model: 'account.move.line',
            fields: [
                'move_id',
                'move_name',
                'date',
                'ref',
                'journal_id',
                'account_id',
                'sequence',
                'name',
                'quantity',
                'price_unit',
                'discount',
                'debit',
                'credit',
                'balance',
                'price_subtotal',
                'price_total',
                'write_date'
            ],
            domain: function (self) {
                return [['move_id', 'in', self.invoice_ids]]
            },
            context: {'pos': true},
            loaded: function (self, invoice_lines) {
                self.db.save_invoice_lines(invoice_lines);
            },
            retail: true,
        },
        {
            model: 'coupon.program',
            fields: [
                'name',
                'rule_id',
                'reward_id',
                'sequence',
                'maximum_use_number',
                'program_type',
                'promo_code_usage',
                'promo_code',
                'promo_applicability',
                'coupon_ids',
                'coupon_count',
                'validity_duration',
                'gift_product_id',
            ],
            condition: function (self) {
                return self.config.load_coupon_program
            },
            domain: function (self) {
                return [
                    ['company_id', '=', self.company.id]
                ]
            },
            loaded: function (self, couponPrograms) {
                self.couponGiftCardTemplate = [];
                self.couponProgramsAutomatic = [];
                self.couponRule_ids = [];
                self.couponReward_ids = [];
                self.couponProgram_by_code = {};
                self.couponProgram_by_id = {};
                self.couponProgram_ids = [];
                self.couponPrograms = couponPrograms;
                self.couponPrograms.forEach(p => {
                    if (!self.couponRule_ids.includes(p.rule_id[0])) {
                        self.couponRule_ids.push(p.rule_id[0])
                    }
                    if (!self.couponReward_ids.includes(p.rule_id[0])) {
                        self.couponReward_ids.push(p.reward_id[0])
                    }
                    if (p.promo_code) {
                        self.couponProgram_by_code[p.promo_code] = p
                    }
                    self.couponProgram_by_id[p.id] = p;
                    self.couponProgram_ids.push(p.id)
                    if (self.config.coupon_program_ids.includes(p.id)) {
                        self.couponProgramsAutomatic.push(p)
                    }
                    if (self.config.coupon_giftcard_ids.includes(p.id)) {
                        self.couponGiftCardTemplate.push(p)
                    }
                })

            }
        },
        {
            label: 'Coupons',
            model: 'coupon.coupon',
            fields: [
                'code',
                'expiration_date',
                'state',
                'partner_id',
                'program_id',
                'discount_line_product_id',
                'is_gift_card',
                'is_returned_order',
                'base_amount',
                'balance_amount',
                'redeem_amount',
            ],
            domain: function (self) {
                return [['state', 'in', ['new', 'sent']], ['program_id', 'in', self.couponProgram_ids]]
            },
            loaded: function (self, coupons) {
                self.coupons = coupons;
                self.coupon_by_code = {};
                self.coupon_by_id = {};
                self.coupon_ids = [];
                self.coupons_by_partner_id = {}
                self.coupons.forEach(c => {
                    self.coupon_by_id[c.id] = c;
                    self.coupon_ids.push(c.id)
                    self.coupon_by_code[c.code] = c
                    if (c.partner_id) {
                        if (!self.coupons_by_partner_id[c.partner_id[0]]) {
                            self.coupons_by_partner_id[c.partner_id[0]] = [c]
                        } else {
                            self.coupons_by_partner_id[c.partner_id[0]].push(c)
                        }
                    }
                })
            }
        },
        {
            label: 'Coupon Rules',
            model: 'coupon.rule',
            fields: [
                'rule_date_from',
                'rule_date_to',
                'rule_partners_domain',
                'rule_products_domain',
                'rule_min_quantity',
                'rule_minimum_amount',
                'rule_minimum_amount_tax_inclusion',
                'applied_partner_ids',
                'applied_product_ids',
            ],
            domain: function (self) {
                return [['id', 'in', self.couponRule_ids]]
            },
            loaded: function (self, couponRules) {
                self.couponRules = couponRules;
                self.couponRule_by_id = {};
                self.couponRule_ids = [];
                self.couponRules.forEach(r => {
                    self.couponRule_by_id[r.id] = r;
                    self.couponRule_ids.push(r.id)
                    let program = self.couponPrograms.find(p => p.rule_id[0] == r.id)
                    if (program) {
                        program.rule = r
                    }
                    // TODO: before 20.06.2021 loading with background, after this time, loading direct for save to POS Cache
                    // rpc.query({
                    //     model: 'coupon.rule',
                    //     method: 'getPartnersAppliedWithRule',
                    //     args: [[], r.id],
                    // }, {
                    //     shadow: true,
                    //     timeout: 60000
                    // }).then(function (result) {
                    //     const rule = self.couponRules.find(r => r.id == result['id'])
                    //     if (rule) {
                    //         rule['applied_partner_ids'] = result['datas']
                    //     }
                    //     console.log(result)
                    // })
                    // rpc.query({
                    //     model: 'coupon.rule',
                    //     method: 'getProductsAppliedWithRule',
                    //     args: [[], r.id],
                    // }, {
                    //     shadow: true,
                    //     timeout: 60000
                    // }).then(function (result) {
                    //     const rule = self.couponRules.find(r => r.id == result['id'])
                    //     if (rule) {
                    //         rule['applied_product_ids'] = result['datas']
                    //     }
                    //     console.log(result)
                    // })
                })

            }
        },
        {
            model: 'coupon.reward',
            fields: [
                'reward_type',
                'reward_product_id',
                'reward_product_quantity',
                'discount_type',
                'discount_percentage',
                'discount_apply_on',
                'discount_specific_product_ids',
                'discount_max_amount',
                'discount_fixed_amount',
                'discount_line_product_id',
            ],
            domain: function (self) {
                return [['id', 'in', self.couponReward_ids]]
            },
            loaded: function (self, couponRewards) {
                self.couponRewards = couponRewards;
                self.couponReward_by_id = {};
                self.couponReward_ids = [];
                self.couponRewards.forEach(rw => {
                    self.couponReward_by_id[rw.id] = rw;
                    self.couponReward_ids.push(rw.id)
                    let program = self.couponPrograms.find(p => p.reward_id[0] == rw.id)
                    if (program) {
                        program.reward = rw
                    }
                })
            }
        },
    ]);

    let _super_Order = models.Order.prototype;
    models.Order = models.Order.extend({
        set_client: function (client) {
            if (!this.pos.the_first_load && client && client['id'] && this.pos.deleted['res.partner'] && this.pos.deleted['res.partner'].indexOf(client['id']) != -1) {
                client = null;
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('This client deleted from backend')
                })
            }
            _super_Order.set_client.apply(this, arguments);
        },
    });
});
