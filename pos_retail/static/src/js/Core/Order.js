"use strict";
/*
    This module create by: thanhchatvn@gmail.com
    License: OPL-1
    Please do not modification if i not accept
    Thanks for understand
 */
odoo.define('pos_retail.order', function (require) {

    const models = require('point_of_sale.models');
    const core = require('web.core');
    const _t = core._t;
    const MultiUnitWidget = require('pos_retail.multi_unit');
    const rpc = require('pos.rpc');
    const qweb = core.qweb;
    const PosComponent = require('point_of_sale.PosComponent');
    const utils = require('web.utils');
    const round_pr = utils.round_precision;
    const {posbus} = require('point_of_sale.utils');
    const round_di = utils.round_decimals;
    const {Gui} = require('point_of_sale.Gui');

    let _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {
            _super_PosModel.initialize.apply(this, arguments);
            this.bind('change:selectedOrder', function (pos) {
                let order = pos.get_order();
                if (order) {
                    order.add_barcode('barcode'); // TODO: add barcode to html page
                }
            });
        }
    });

    let _super_Order = models.Order.prototype;
    models.Order = models.Order.extend({
        initialize: function (attributes, options) {
            _super_Order.initialize.apply(this, arguments);
            let self = this;
            if (!this.note) {
                this.note = '';
            }
            if (!this.signature) {
                this.signature = '';
            }
            if (!this.lock) {
                this.lock = false;
            }
            if (this.pos.config.auto_invoice || (this.pos.config.customer_default_id && this.pos.config.auto_invoice_with_customer_default)) {
                this.to_invoice = true;
            }
            if (!this.seller && this.pos.default_seller) {
                this.seller = this.pos.default_seller;
            }
            if (!this.seller && this.pos.config.default_seller_id) {
                let seller = this.pos.user_by_id[this.pos.config.default_seller_id[1]];
                if (seller) {
                    this.seller = seller;
                }
            }
            if (!options.json) {
                if (this.pos.config.analytic_account_id) {
                    this.analytic_account_id = this.pos.config.analytic_account_id[0]
                }
                let pos_config_currency_id = this.pos.config.currency_id[0];
                let config_currency = this.pos.currency_by_id[pos_config_currency_id];
                if (config_currency) {
                    this.currency = config_currency;
                    this.currency_id = this.pos.config.currency_id[0];
                }
                this.status = 'Coming'
                let picking_type_id = this.pos.config.picking_type_id[0];
                this.set_picking_type(picking_type_id);
                this.plus_point = 0;
                this.redeem_point = 0;
            }
            this.bind('add remove', function (order) {
                self.pos.trigger('refresh.tickets', order)
            });
            this.orderlines.bind('change add remove', function (line) {
                self.pos.trigger('refresh.tickets')
            });
        },

        generate_unique_id: function () {
            const newUniqueNumber = _super_Order.generate_unique_id.apply(this, arguments);
            console.log('newUniqueNumber: ' + newUniqueNumber)
            return newUniqueNumber
        },
        is_paid: function () {
            const isPaid = _super_Order.is_paid.apply(this, arguments);
            return isPaid
        },

        async ask_guest() {
            let {confirmed, payload: number} = await Gui.showPopup('NumberPopup', {
                'title': _t('How many guests in this Table ?'),
                'startingValue': 0,
            });
            if (confirmed) {
                let value = Math.max(1, Number(number));
                if (value < 1) {
                    this.pos.set_table(null);
                    this.pos.alert_message({
                        title: _t('Alert'),
                        body: _t('Please input guest, and bigger than 1')
                    })
                } else {
                    this.guest_not_set = true
                    this.set_customer_count(value);
                }
            }
        },


        set_tip: async function (tip) {
            let tip_product = this.pos.db.get_product_by_id(this.pos.config.tip_product_id[0]);
            if (!tip_product) {
                let result = await this.pos.chrome.rpc({
                    model: 'product.product',
                    method: 'force_write',
                    args: [[this.pos.config.tip_product_id[0]], {
                        'available_in_pos': true,
                        'sale_ok': true,
                        'active': true,
                    }],
                    context: {}
                })
                if (result) {
                    await this.pos.syncProductsPartners();
                } else {
                    return this.pos.alert_message({
                        title: _t('Error'),
                        body: _t('Please check your internet or your Odoo Server Offline Mode')
                    })
                }

            }
            _super_Order.set_tip.apply(this, arguments);
        },

        save_to_db: function () {
            _super_Order.save_to_db.apply(this, arguments);
            let selected_line = this.get_selected_orderline();
            if (selected_line) {
                this.pos.trigger('selected:line', selected_line)
            }
        },
        init_from_JSON: function (json) {
            // TODO: we removed line have product removed
            let lines = json.lines;
            let lines_without_product_removed = [];
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                let product_id = line[2]['product_id'];
                let product = this.pos.db.get_product_by_id(product_id);
                if (product) {
                    lines_without_product_removed.push(line)
                }
            }
            json.lines = lines_without_product_removed;
            // ---------------------------------
            let res = _super_Order.init_from_JSON.apply(this, arguments);
            if (json.plus_point) {
                this.plus_point = json.plus_point;
            }
            if (json.redeem_point) {
                this.redeem_point = json.redeem_point;
            }
            if (json.booking_id) {
                this.booking_id = json.booking_id;
            }
            if (json.status) {
                this.status = json.status
            }
            if (json.date) {
                this.date = json.date;
            }
            if (json.name) {
                this.name = json.name;
            }
            if (json.email_invoice) {
                this.email_invoice = json.email_invoice;
            }
            if (json.email_invoice) {
                this.email_invoice = json.email_invoice;
            }
            if (json.delivery_date) {
                this.delivery_date = json.delivery_date;
            }
            if (json.delivery_address) {
                this.delivery_address = json.delivery_address;
            }
            if (json.delivery_phone) {
                this.delivery_phone = json.delivery_phone;
            }
            if (json.amount_debit) {
                this.amount_debit = json.amount_debit;
            }
            if (json.return_order_id) {
                this.return_order_id = json.return_order_id;
            }
            if (json.is_return) {
                this.is_return = json.is_return;
            }
            if (json.to_invoice) {
                this.to_invoice = json.to_invoice;
            }
            if (json.parent_id) {
                this.parent_id = json.parent_id;
            }
            if (json.payment_journal_id) {
                this.payment_journal_id = json.payment_journal_id;
            } else {
                this.payment_journal_id = this.pos.get_default_sale_journal();
            }
            if (json.ean13) {
                this.ean13 = json.ean13;
            }
            if (json.signature) {
                this.signature = json.signature
            }
            if (json.note) {
                this.note = json.note
            }
            if (json.lock) {
                this.lock = json.lock;
            } else {
                this.lock = false;
            }
            if (json.guest) {
                this.guest = json.guest;
            }
            if (json.guest_number) {
                this.guest_number = json.guest_number;
            }
            if (json.location_id) {
                let location = this.pos.stock_location_by_id[json.location_id];
                if (location) {
                    this.set_stock_location(location)
                } else {
                    let location = this.pos.get_source_stock_location();
                    this.set_stock_location(location)
                }
            } else {
                let location = this.pos.get_source_stock_location();
                if (location) {
                    this.set_stock_location(location);
                }
            }
            if (json.add_credit) {
                this.add_credit = json.add_credit
            } else {
                this.add_credit = false;
            }
            if (json.user_id) {
                this.seller = this.pos.user_by_id[json.user_id];
            }
            if (json.currency_id) {
                let currency = this.pos.currency_by_id[json.currency_id];
                this.currency = currency;
            }
            if (json.analytic_account_id) {
                this.analytic_account_id = json.analytic_account_id
            }
            if (json.shipping_id) {
                this.shipping_id = json.shipping_id
            }
            if (json.employee_id) {
                // todo: default module point_of_sale core odoo define variable employee_id linked to cashier but backend not define employee_id
                // todo: my module have define employee_id, and when force cashier id to employee will have issue
                // todo: so we recheck have employee with cashier id or not, if yes, allow save, else set back null
                if (this.pos.employee_by_id) {
                    let employee = this.pos.employee_by_id[json.employee_id]
                    if (!employee) {
                        this.employee_id = null
                    }
                } else {
                    this.employee_id = null
                }
            }
            if (json.picking_type_id) {
                this.set_picking_type(json.picking_type_id)
            }
            if (json.guest_not_set) {
                this.guest_not_set = json.guest_not_set
            }
            return res;
        },
        export_as_JSON: function () {
            let json = _super_Order.export_as_JSON.apply(this, arguments);
            if (this.promotion_amount) {
                json.promotion_amount = this.promotion_amount;
            }
            if (this.plus_point) {
                json.plus_point = this.plus_point;
            }
            if (this.redeem_point) {
                json.redeem_point = this.redeem_point;
            }
            if (this.booking_id) {
                json.booking_id = this.booking_id
            }
            if (this.status) {
                json.status = this.status
            } else {
                json.status = 'Coming'
            }
            if (this.seller) {
                json.user_id = this.seller['id'];
            }
            if (this.partial_payment) {
                json.partial_payment = this.partial_payment
            }
            if (this.email_invoice) {
                json.email_invoice = this.email_invoice;
                let client = this.get_client();
                if (client && client.email) {
                    json.email = client.email;
                }
            }
            if (this.delivery_date) {
                json.delivery_date = this.delivery_date;
            }
            if (this.delivery_address) {
                json.delivery_address = this.delivery_address;
            }
            if (this.delivery_phone) {
                json.delivery_phone = this.delivery_phone;
            }
            if (this.amount_debit) {
                json.amount_debit = this.amount_debit;
            }
            if (this.return_order_id) {
                json.return_order_id = this.return_order_id;
            }
            if (this.is_return) {
                json.is_return = this.is_return;
            }
            if (this.parent_id) {
                json.parent_id = this.parent_id;
            }
            if (this.payment_journal_id) {
                json.payment_journal_id = this.payment_journal_id;
            } else {
                this.payment_journal_id = this.pos.get_default_sale_journal();
            }
            if (this.note) {
                json.note = this.note;
            }
            if (this.signature) {
                json.signature = this.signature;
            }
            if (this.ean13) {
                json.ean13 = this.ean13;
                this.add_barcode('barcode')
            }
            if (!this.ean13 && this.uid) {
                let ean13_code = this.zero_pad('6', 4) + this.zero_pad(this.pos.pos_session.login_number, 4) + this.zero_pad(this.sequence_number, 4);
                let ean13 = ean13_code.split("");
                let ean13_array = [];
                for (let i = 0; i < ean13.length; i++) {
                    if (i < 12) {
                        ean13_array.push(ean13[i])
                    }
                }
                this.ean13 = ean13_code + this.generate_unique_ean13(ean13_array).toString();
                this.add_barcode('barcode')
            }
            if (this.lock) {
                json.lock = this.lock;
            } else {
                json.lock = false;
            }
            if (this.invoice_ref) {
                json.invoice_ref = this.invoice_ref
            }
            if (this.picking_ref) {
                json.picking_ref = this.picking_ref
            }
            if (this.guest) {
                json.guest = this.guest
            }
            if (this.guest_number) {
                json.guest_number = this.guest_number
            }
            if (this.add_credit) {
                json.add_credit = this.add_credit
            } else {
                json.add_credit = false
            }
            if (this.location_id) {
                let stock_location_id = this.pos.config.stock_location_id;
                if (stock_location_id) {
                    let location = this.pos.stock_location_by_id[this.location_id];
                    if (location) {
                        json.location = location;
                        json.location_id = location.id;
                    }
                }
            }
            if (this.currency) {
                json.currency_id = this.currency.id
            }
            if (this.analytic_account_id) {
                json.analytic_account_id = this.analytic_account_id
            }
            if (this.shipping_id) {
                json.shipping_id = this.shipping_id
            }
            if (json.employee_id) {
                // todo: default module point_of_sale core odoo define variable employee_id linked to cashier but backend not define employee_id
                // todo: my module have define employee_id, and when force cashier id to employee will have issue
                // todo: so we recheck have employee with cashier id or not, if yes, allow save, else set back null
                if (this.pos.employee_by_id) {
                    let employee = this.pos.employee_by_id[json.employee_id]
                    if (!employee) {
                        json.employee_id = null;
                        this.employee_id = null;
                    }
                } else {
                    json.employee_id = null;
                    this.employee_id = null;
                }

            }
            if (this.picking_type) {
                json.picking_type_id = this.picking_type.id;
            }
            if (this.guest_not_set) {
                json.guest_not_set = this.guest_not_set
            }
            if (this.state) {
                json.state = this.state
            }
            if (this.removed_user_id) {
                json.removed_user_id = this.removed_user_id
            }
            if (this.save_draft) {
                json.save_draft = this.save_draft
            }
            if (this.backend_id) {
                json.backend_id = this.backend_id
            }
            if (this.receiptBase64) {
                json.receiptBase64 = this.receiptBase64
            }
            return json;
        },
        export_for_printing: function () {
            let receipt = _super_Order.export_for_printing.call(this);
            if (this.promotion_amount) {
                receipt.promotion_amount = this.promotion_amount;
            }
            receipt.plus_point = this.plus_point || 0;
            receipt.redeem_point = this.redeem_point || 0;
            let order = this.pos.get_order();
            if (!order) {
                return receipt
            }
            if (this.picking_type) {
                receipt['picking_type'] = this.picking_type;
            }
            if (this.seller) {
                receipt['seller'] = this.seller;
            }
            if (this.location) {
                receipt['location'] = this.location;
            } else {
                let stock_location_id = this.pos.config.stock_location_id;
                if (stock_location_id) {
                    receipt['location'] = this.pos.stock_location_by_id[stock_location_id[0]];
                }
            }
            receipt['order'] = order
            receipt['currency'] = order.currency;
            receipt['guest'] = this.guest;
            receipt['guest_number'] = this.guest_number;
            receipt['delivery_date'] = this.delivery_date;
            receipt['delivery_address'] = this.delivery_address;
            receipt['delivery_phone'] = this.delivery_phone;
            receipt['note'] = this.note;
            receipt['signature'] = this.signature;
            if (this.shipping_client) {
                receipt['shipping_client'] = this.shipping_client;
            }
            if (this.fiscal_position) {
                receipt.fiscal_position = this.fiscal_position
            }
            if (this.amount_debit) {
                receipt['amount_debit'] = this.amount_debit;
            }
            let orderlines_by_category_name = {};
            let orderlines = order.orderlines.models;
            let categories = [];
            receipt['categories'] = [];
            receipt['orderlines_by_category_name'] = [];
            if (this.pos.config.category_wise_receipt) {
                for (let i = 0; i < orderlines.length; i++) {
                    let line = orderlines[i];
                    let pos_categ_id = line['product']['pos_categ_id']
                    line['tax_amount'] = line.get_tax();
                    if (pos_categ_id && pos_categ_id.length == 2) {
                        let root_category_id = order.get_root_category_by_category_id(pos_categ_id[0])
                        let category = this.pos.db.category_by_id[root_category_id]
                        let category_name = category['name'];
                        if (!orderlines_by_category_name[category_name]) {
                            orderlines_by_category_name[category_name] = [line];
                            let category_index = _.findIndex(categories, function (category) {
                                return category == category_name;
                            });
                            if (category_index == -1) {
                                categories.push(category_name)
                            }
                        } else {
                            orderlines_by_category_name[category_name].push(line)
                        }

                    } else {
                        if (!orderlines_by_category_name['None']) {
                            orderlines_by_category_name['None'] = [line]
                        } else {
                            orderlines_by_category_name['None'].push(line)
                        }
                        let category_index = _.findIndex(categories, function (category) {
                            return category == 'None';
                        });
                        if (category_index == -1) {
                            categories.push('None')
                        }
                    }
                }
                receipt['orderlines_by_category_name'] = orderlines_by_category_name;
                receipt['categories'] = categories;
            }
            receipt['total_due'] = order.get_due(); // save amount due if have (display on receipt of parital order)
            if (order.internal_ref) {
                receipt['internal_ref'] = order.internal_ref
            }
            if (order.purchase_ref) {
                receipt['purchase_ref'] = order.purchase_ref
            }
            if (order.booking_uid) {
                receipt['booking_uid'] = order.booking_uid
            }
            if (order.sequence_number) {
                receipt['sequence_number'] = order.sequence_number
            }
            if (order.coupon_code) {
                receipt['coupon_code'] = this.coupon_code;
            }
            if (order.date_order) {
                receipt['date_order'] = this.date_order;
            }
            receipt['plus_point'] = parseInt(order['plus_point'])
            receipt['redeem_point'] = parseInt(order['redeem_point'])
            receipt['client'] = null
            if (order.get_client()) {
                receipt['client'] = order.get_client()
            }
            receipt['total_discount'] = order.get_total_discount()
            return receipt
        },

        isValidMinMaxPrice() {
            const self = this
            let pricelistOfOrder = this.pos._get_active_pricelist();
            let isValid = true
            for (let i = 0; i < this.orderlines.models.length; i++) {
                let l = this.orderlines.models[i]
                let uom_id = l.product.uom_id[0]
                if (l.uom_id) {
                    uom_id = l.uom_id
                }
                let pricelistItemHasMinMaxRule = l.product.get_pricelist_item_applied(pricelistOfOrder, l.quantity, uom_id)
                if (pricelistItemHasMinMaxRule && (l.price < pricelistItemHasMinMaxRule['min_price'] || l.price > pricelistItemHasMinMaxRule['max_price'])) {
                    isValid = false
                    Gui.showPopup('ErrorPopup', {
                        title: l.product.display_name + _t(' Current Price: ') + self.pos.format_currency(l.price) + _t(' Invalid !!!'),
                        body: _t('Price required Between: ') + self.pos.format_currency(pricelistItemHasMinMaxRule.min_price) + _t(' to ') + self.pos.format_currency(pricelistItemHasMinMaxRule.max_price),
                    })
                }
            }
            return isValid
        },

        get_won_points: function () {
            if (!this.pos.config.loyalty_id) {
                return 0
            } else {
                return _super_Order.get_won_points.call(this);
            }
        },

        get_new_points() {
            if (!this.pos.config.loyalty_id) {
                return 0
            } else {
                return _super_Order.get_new_points.call(this);
            }
        },

        async setBundlePackItems() {
            let order = this;
            let selectedLine = order.get_selected_orderline();
            if (selectedLine) {
                let combo_items = this.pos.combo_items.filter((c) => selectedLine.product.product_tmpl_id == c.product_combo_id[0])
                if (combo_items.length == 0) {
                    return this.pos.alert_message({
                        title: _t('Error'),
                        body: selectedLine.product.display_name + _t(' have not set Combo Items')
                    })
                } else {
                    if (!selectedLine.combo_items) {
                        selectedLine.combo_items = [];
                    }
                    let selectedComboItems = selectedLine.combo_items.map((c) => c.id)
                    combo_items.forEach(function (c) {
                        if (selectedComboItems.indexOf(c.id) != -1) {
                            c.selected = true
                        } else {
                            c.selected = false;
                        }
                        c.display_name = c.product_id[1];
                    })
                    let {confirmed, payload: result} = await Gui.showPopup('PopUpSelectionBox', {
                        title: _t('Select Bundle/Pack Items'),
                        items: combo_items
                    })
                    if (confirmed) {
                        if (result.items.length) {
                            selectedLine.set_combo_bundle_pack(result.items);
                        } else {
                            selectedLine.set_combo_bundle_pack([]);
                        }
                    }
                }

            } else {
                return this.pos.alert_message({
                    title: _t('Error'),
                    body: _t('Please selected 1 line')
                })
            }
        },
        async suggestItems() {
            let selectedOrder = this;
            let selectedLine = selectedOrder.get_selected_orderline();
            if (!selectedLine) {
                return this.pos.alert_message({
                    title: _t('Error'),
                    body: _t('Have not any line set selected')
                })
            }
            let product = selectedLine.product;
            let crossItems = this.pos.cross_items_by_product_tmpl_id[product.product_tmpl_id];
            if (!crossItems || crossItems.length == 0) {
                return this.pos.alert_message({
                    title: _t('Error'),
                    body: product.display_name + _t(' not active feature Cross Selling')
                })
            }
            let {confirmed, payload: results} = await Gui.showPopup('PopUpSelectionBox', {
                title: _t('Suggest Customer buy more Products with ' + product.display_name),
                items: crossItems,
            })
            if (confirmed) {
                let selectedCrossItems = results.items;
                for (let index in selectedCrossItems) {
                    let item = selectedCrossItems[index];
                    let product = this.pos.db.get_product_by_id(item['product_id'][0]);
                    if (product) {
                        if (!product) {
                            continue
                        }
                        let price = item['list_price'];
                        let discount = 0;
                        if (item['discount_type'] == 'fixed') {
                            price = price - item['discount']
                        }
                        if (item['discount_type'] == 'percent') {
                            discount = item['discount']
                        }
                        selectedOrder.add_product(product, {
                            quantity: item['quantity'],
                            price: price,
                            merge: false,
                        });
                        if (discount > 0) {
                            selectedOrder.get_selected_orderline().set_discount(discount)
                        }
                    } else {
                        this.pos.chrome.showNotification(item['product_id'][1], _t('Not available in POS'))
                    }
                }
            }
        },
        async setProductPackaging() {
            let selectedOrder = this;
            if (!selectedOrder.get_selected_orderline()) {
                return this.pos.alert_message({
                    title: _t('Error'),
                    body: _t('This feature only active with Products has setup Cross Selling')
                })
            }
            let selectedLine = this.pos.get_order().get_selected_orderline();
            if (!selectedLine.product.sale_with_package || !this.pos.packaging_by_product_id[selectedLine.product.id]) {
                return this.pos.alert_message({
                    title: _t('Error'),
                    body: selectedLine.product.display_name + _t(' not active feature Product Packaging or have not any packaging')
                })
            }
            let product = selectedLine.product
            let packagings = this.pos.packaging_by_product_id[product.id];
            let packList = packagings.map((p) => ({
                id: p.id,
                item: p,
                label: p.name + _t(' : have Contained quantity ') + p.qty + _t(' with sale price ') + this.pos.format_currency(p.list_price)
            }))
            let {confirmed, payload: packSelected} = await Gui.showPopup('SelectionPopup', {
                title: _t('Select sale from Packaging'),
                list: packList
            })
            if (confirmed) {
                let selectedLine = selectedOrder.get_selected_orderline();
                selectedLine.packaging = packSelected;
                selectedLine.set_quantity(packSelected.qty, 'set quantity manual via packing');
                if (packSelected.list_price > 0) {
                    selectedLine.set_unit_price(packSelected.list_price / packSelected.qty);
                }

            }
        },
        async setMultiVariant() {
            let selectedOrder = this;
            let selectedLine = selectedOrder.get_selected_orderline();
            if (!selectedLine) {
                return this.pos.alert_message({
                    title: _t('Error'),
                    body: _t('Your order is blank cart')
                })
            }
            let product = selectedLine.product;
            let variants = this.pos.variant_by_product_tmpl_id[product.product_tmpl_id];
            if (!variants) {
                return this.pos.alert_message({
                    title: _t('Error'),
                    body: product.display_name + _t(' have not Active Multi Variant')
                })
            }
            let variantsSelectedIds = []
            if (selectedLine.variants) {
                variantsSelectedIds = selectedLine.variants.map((v) => (v.id))
            }
            variants.forEach(function (v) {
                if (variantsSelectedIds.indexOf(v.id) != -1) {
                    v.selected = true
                } else {
                    v.selected = false;
                }
            })

            let {confirmed, payload: results} = await Gui.showPopup('PopUpSelectionBox', {
                title: _t('Select Variants and Values for Product: ') + selectedLine.product.display_name,
                items: variants
            })
            if (confirmed) {
                let variantIds = results.items.map((i) => (i.id))
                selectedLine.set_variants(variantIds);
            }
        },

        async submitOrderToBackEnd() {
            const selectedOrder = this;
            const selectionList = this.pos.payment_methods.map((p) => ({
                id: p.id,
                item: p,
                name: p.name
            }))
            let {confirmed, payload: selectedItems} = await Gui.showPopup(
                'PopUpSelectionBox',
                {
                    title: _t('If have not Exchange Products, Please select one Payment Method for full fill Amount of Order: ') + this.pos.format_currency(selectedOrder.get_total_with_tax()),
                    items: selectionList,
                    onlySelectOne: true,
                }
            );
            if (confirmed && selectedItems['items'].length > 0) {
                const paymentMethod = selectedItems['items'][0]['item']
                selectedOrder.paymentlines.models.forEach(function (p) {
                    selectedOrder.remove_paymentline(p)
                })
                selectedOrder.add_paymentline(paymentMethod);
                const paymentLine = selectedOrder.selected_paymentline;
                paymentLine.set_amount(selectedOrder.get_total_with_tax());
                selectedOrder.trigger('change', selectedOrder);
                let order_ids = this.pos.push_single_order(selectedOrder, {})
                console.log('{submitOrderToBackEnd} pushed succeed order_ids: ' + order_ids)
                return this.pos.chrome.showScreen('ReceiptScreen');
            } else {
                selectedOrder.is_return = false
                selectedOrder.trigger('change', selectedOrder);
            }
        },

        build_plus_point: function () {
            let total_point = 0;
            let lines = this.orderlines.models;
            if (lines.length == 0 || !lines) {
                return total_point;
            }
            let loyalty = this.pos.retail_loyalty;
            if (!loyalty || !this.pos.rules_by_loyalty_id) {
                return total_point;
            }
            let rules = [];
            let rules_by_loylaty_id = this.pos.rules_by_loyalty_id[loyalty.id];
            if (!rules_by_loylaty_id) {
                return total_point;
            }
            for (let j = 0; j < rules_by_loylaty_id.length; j++) {
                rules.push(rules_by_loylaty_id[j]);
            }
            if (!rules) {
                return total_point;
            }
            if (rules.length) {
                for (let j = 0; j < lines.length; j++) { // TODO: reset plus point each line
                    let line = lines[j];
                    line.plus_point = 0;
                }
                // Todo: we have 3 type rule
                //      - plus point base on order amount total
                //      - plus point base on pos category
                //      - plus point base on amount total
                for (let j = 0; j < lines.length; j++) {
                    let line = lines[j];
                    if (line['redeem_point'] || (line['promotion'] && !this.pos.config.loyalty_combine_promotion)) {
                        line['plus_point'] = 0;
                        continue;
                    } else {
                        line.plus_point = 0;
                        for (let i = 0; i < rules.length; i++) {
                            let rule = rules[i];
                            let plus_point = 0;
                            plus_point = line.get_price_with_tax() * rule['coefficient'];
                            if ((rule['type'] == 'products' && rule['product_ids'].indexOf(line.product['id']) != -1) || (rule['type'] == 'categories' && rule['category_ids'].indexOf(line.product.pos_categ_id[0]) != -1) || (rule['type'] == 'order_amount')) {
                                line.plus_point += plus_point;
                                total_point += plus_point;
                            }
                        }
                    }
                }
            }
            return total_point;
        },
        build_redeem_point: function () {
            let redeem_point = 0;
            let lines = this.orderlines.models;
            if (lines.length == 0 || !lines) {
                return redeem_point;
            }
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (!line.reward_id) {
                    continue
                } else {
                    let rewardSelected = this.pos.reward_by_id[line.reward_id]
                    let redeemPoint = 0
                    if (rewardSelected.type == 'use_point_payment') {
                        redeemPoint = line.price * line.quantity / rewardSelected['coefficient']
                    } else if (rewardSelected.type == 'gift') {
                        redeemPoint = line.quantity * rewardSelected['coefficient']
                    } else if (line.redeem_point) {
                        redeemPoint = line.redeem_point
                    }
                    if (redeemPoint < 0) {
                        redeemPoint = -redeemPoint
                    }
                    line.redeem_point = redeemPoint
                    redeem_point += line.redeem_point
                }
            }
            return round_pr(redeem_point || 0, this.pos.retail_loyalty.rounding);
        },
        get_client_points: function () {
            let client = this.get_client();
            if (!client) {
                return {
                    redeem_point: 0,
                    plus_point: 0,
                    pos_loyalty_point: 0,
                    remaining_point: 0,
                    next_point: 0,
                    client_point: 0
                }
            }
            let redeem_point = this.build_redeem_point();
            let plus_point = this.build_plus_point();
            if (this.pos.retail_loyalty.rounding_down) {
                plus_point = parseInt(plus_point);
            }
            let pos_loyalty_point = client.pos_loyalty_point || 0;
            let remaining_point = pos_loyalty_point - redeem_point;
            let next_point = pos_loyalty_point - redeem_point + plus_point;
            return {
                redeem_point: redeem_point,
                plus_point: plus_point,
                pos_loyalty_point: pos_loyalty_point,
                remaining_point: remaining_point,
                next_point: next_point,
                client_point: pos_loyalty_point,
            }
        },
        client_use_voucher: function (voucher) {
            const self = this;
            this.voucher_id = voucher.id;
            let method = _.find(this.pos.payment_methods, function (method) {
                return method.pos_method_type == 'voucher';
            });
            if (method) {
                this.paymentlines.models.forEach(function (p) {
                    if (p.payment_method.journal && p.payment_method.journal.pos_method_type == 'voucher') {
                        self.remove_paymentline(p)
                    }
                })
                let due = this.get_due();
                if (voucher['customer_id'] && voucher['customer_id'][0]) {
                    let client = this.pos.db.get_partner_by_id(voucher['customer_id'][0]);
                    if (client) {
                        this.set_client(client)
                    }
                }
                let amount = 0;
                if (voucher['apply_type'] == 'fixed_amount') {
                    amount = voucher.value;
                } else {
                    amount = this.get_total_with_tax() / 100 * voucher.value;
                }
                if (amount <= 0) {
                    return Gui.showPopup('ConfirmPopup', {
                        title: _t('Warning'),
                        body: _t('Voucher Used Full Amount, please use another Voucher'),
                        disableCancelButton: true,
                    });
                }
                this.add_paymentline(method);
                let voucher_paymentline = this.selected_paymentline;
                voucher_paymentline['voucher_id'] = voucher['id'];
                voucher_paymentline['voucher_code'] = voucher['code'];
                let voucher_amount = 0;
                if (amount >= due) {
                    voucher_amount = due;
                } else {
                    voucher_amount = amount;
                }
                if (voucher_amount > 0) {
                    voucher_paymentline.set_amount(voucher_amount);
                    this.pos.alert_message({
                        title: _t('Success! Voucher just set to Payment Order'),
                        body: _t('Set ' + this.pos.format_currency(voucher_amount)) + ' to Payment Amount of Order ',
                    });
                } else {
                    this.pos.alert_message({
                        title: _t('Warning'),
                        body: _t('Selected Order Paid Full, Could not adding more Voucher Value'),
                    });
                }
            } else {
                this.pos.alert_message({
                    title: _t('Warning'),
                    body: _t('Your POS Payment Voucher removed, we could not add voucher to your Order'),
                });
            }
        },
        set_picking_type: function (picking_type_id) {
            let picking_type = this.pos.stock_picking_type_by_id[picking_type_id];
            this.picking_type = picking_type;
            this.pos.trigger('set.picking.type')
        },
        remove_paymentline: function (line) {
            let res = _super_Order.remove_paymentline.apply(this, arguments);
            console.log('[remove_paymentline] deleted payment line')
        },
        set_pricelist: function (pricelist) {
            let self = this
            if (this.currency && pricelist.currency_id && this.currency.id != pricelist.currency_id[0]) {
                this.paymentlines.models.forEach(function (p) {
                    self.remove_paymentline(p)
                })
            }
            let lastPricelist = this.pricelist;
            // todo: we not call super odoo because
            let res = _super_Order.set_pricelist.apply(this, arguments);
            // todo: when change pricelist difference currency with POS, auto recompute price of cart
            if (!this.is_return && pricelist && pricelist.currency_id && lastPricelist && pricelist['id'] != lastPricelist['id']) {
                let selectedCurrency = this.pos.currency_by_id[pricelist.currency_id[0]];
                if (lastPricelist && lastPricelist.currency_id && pricelist.currency_id && lastPricelist.currency_id[0] != pricelist.currency_id[0]) {
                    let linesToReCompute = this.get_orderlines().filter((l) => !l.price_manually_set)
                    linesToReCompute.forEach(function (l) {
                        l.set_unit_price(l.product.get_price(pricelist, l.get_quantity()));
                        self.fix_tax_included_price(l);
                    })
                }
                this.currency = selectedCurrency;
                this.pricelist = pricelist;
                this.trigger('change', this);
            }
            return res;
        },
        add_paymentline: function (payment_method) {
            let newPaymentline = _super_Order.add_paymentline.apply(this, arguments);
            if (payment_method.fullfill_amount && this.get_due() != 0) {
                newPaymentline.set_amount(this.get_due())
            }
            this.pos.trigger('refresh.customer.facing.screen');
            return newPaymentline;
        },
        set_stock_location: function (location) {
            // todo: set location_id for order backend
            this.location = location;
            this.location_id = location.id;
            this.pos.config.stock_location_id = [location.id, location.name];
            this.trigger('change', this);
        },
        remove_selected_orderline: function () {
            let line = this.get_selected_orderline();
            if (line) {
                this.remove_orderline(line)
            }
        },
        set_currency: function (currency) {
            let rate = currency.rate;
            if (rate > 0) {
                let lines = this.orderlines.models;
                for (let n = 0; n < lines.length; n++) {
                    let line = lines[n];
                    line.set_unit_price_with_currency(line.price, currency)
                }
                this.currency = currency;
                this.pos.trigger('change:currency'); // TODO: update ticket and order cart
            } else {
                this.currency = null;
            }
            this.trigger('change', this);
        },
        add_barcode: function (element) {
            if (!this.element) {
                try {
                    JsBarcode('#' + element, this['ean13'], {
                        format: "EAN13",
                        displayValue: true,
                        fontSize: 14
                    });
                    this[element + '_bas64'] = document.getElementById(element).src
                } catch (ex) {
                    console.warn('Error set barcode to element: ' + ex)
                }
            }
        },
        zero_pad: function (num, size) {
            if (num == undefined) {
                console.error('Login number error: ' + num)
                num = '0123456789'
            }
            let s = "" + num;
            while (s.length < size) {
                s = s + Math.floor(Math.random() * 10).toString();
            }
            return s;
        },
        get_guest: function () {
            if (this.guest) {
                return this.guest
            } else {
                return null
            }
        },
        _get_client_content: function (client) {
            let content = '';
            if (client.mobile) {
                content += 'Mobile: ' + client.mobile + ' , ';
            }
            if (client.phone) {
                content += 'Mobile: ' + client.phone + ' , ';
            }
            if (client.email) {
                content += 'Email: ' + client.email + ' , ';
            }
            if (client.address) {
                content += 'Address: ' + client.address + ' , ';
            }
            if (client.balance) {
                content += 'Credit: ' + this.pos.format_currency(client.balance) + ' , ';
            }
            if (client.wallet) {
                content += 'Wallet Card: ' + this.pos.format_currency(client.wallet) + ' , ';
            }
            if (client.pos_loyalty_point) {
                content += 'Loyalty Point: ' + this.pos.format_currency_no_symbol(client.pos_loyalty_point) + ' , ';
            }
            return content
        },
        set_shipping_client: function (client) {
            this.assert_editable();
            this.set('client', client);
            this.shipping_client = client;
        },

        async alertOrdersOfClientNotPaidFull(client) {
            let partial_payment_orders = _.filter(this.pos.db.get_pos_orders(), function (order) {
                return order['partner_id'] && order['partner_id'][0] == client['id'] && order['state'] == 'draft';
            });
            if (partial_payment_orders.length != 0) {
                let due_amount = 0
                partial_payment_orders.forEach(o => {
                    due_amount += o.amount_total
                })
                if (due_amount != 0) {
                    const {confirmed, payload: group} = await Gui.showPopup('ConfirmPopup', {
                        title: _t('Customer: ') + client.display_name,
                        body: _t('Have Total ') + partial_payment_orders.length + _t(' Orders not paid full. With Due Amount: ') + this.pos.format_currency(due_amount) + _t('. Are you want open it ?'),
                    })
                    if (confirmed) {
                        const {confirmed, payload: result} = await Gui.showTempScreen(
                            'PosOrderScreen',
                            {
                                order: partial_payment_orders[0],
                                selectedClient: client
                            }
                        );
                    }
                }
            } else {
                return true
            }
        },
        set_client: async function (client) {
            let self = this;
            if (!client && !this.pos.the_first_load && this.pos.chrome && this.pos.config.add_customer_before_products_already_in_shopping_cart) {
                return this.pos.alert_message({
                    title: _t('Warning'),
                    body: _t('You can not deselect and set null Customer. Because your POS active feature Required add Customer to cart')
                })
            }
            const res = _super_Order.set_client.apply(this, arguments);
            if (client && !this.pos.the_first_load) {
                if (this.pos.config.pos_orders_management) {
                    setTimeout(() => {
                        self.alertOrdersOfClientNotPaidFull(client)
                    }, 1000)
                }
                if (client.balance < 0) {
                    this.pos.chrome.showNotification(client.name, _t('Has Credit Balance : ' + this.pos.format_currency(client.balance) + '. Credit Balance Amount of this customer smaller than 0'))
                }
                if (client.group_ids.length > 0) {
                    let lists = [];
                    for (let i = 0; i < client.group_ids.length; i++) {
                        let group_id = client.group_ids[i];
                        let group = this.pos.membership_group_by_id[group_id];
                        if (group.pricelist_id) {
                            lists.push({
                                'id': group.id,
                                'label': group.name + this.pos.env._t(' with a pricelist: ') + group.pricelist_id[1],
                                'item': group
                            });
                        }
                    }
                    if (lists.length > 0) {
                        const {confirmed, payload: group} = await Gui.showPopup('SelectionPopup', {
                            title: this.pos.env._t('Choice one Group/MemberShip'),
                            list: lists
                        })
                        if (confirmed) {
                            if (!this.pos.pricelist_by_id[group.pricelist_id[0]]) {
                                this.pos.alert_message({
                                    title: _t('Error'),
                                    body: _t('Your POS not added pricelist: ') + group.pricelist_id[1],
                                })
                            } else {
                                let pricelist = this.pos.pricelist_by_id[group.pricelist_id[0]];
                                this.set_pricelist(pricelist);
                            }
                        }
                    }
                }
                if (this.pos.coupons_by_partner_id && this.pos.coupons_by_partner_id[client.id] && this.get_total_with_tax() > 0) {
                    let lists = this.pos.coupons_by_partner_id[client.id].map(c => ({
                        id: c.id,
                        label: c.code,
                        item: c
                    }))
                    const {confirmed, payload: coupon} = await Gui.showPopup('SelectionPopup', {
                        title: client.display_name + this.pos.env._t(' have some Coupons, please select one apply to Order'),
                        list: lists
                    })
                    if (confirmed) {
                        this.pos.getInformationCouponPromotionOfCode(coupon.code)
                    }
                }
            }
            if (client && this.pos.services_charge_ids && this.pos.services_charge_ids.length && this.pos.config.service_shipping_automatic && !this.pos.the_first_load) {
                this.pos.rpc({
                    model: 'pos.service.charge',
                    method: 'get_service_shipping_distance',
                    args: [[], client.id, this.pos.config.stock_location_id[0]],
                    context: {}
                }, {
                    shadow: true,
                    timeout: 6500,
                }).then(function (service) {
                    for (let i = 0; i < self.orderlines.models.length; i++) {
                        let line = self.orderlines.models[i];
                        if (line.is_shipping_cost) {
                            self.remove_orderline(line);
                        }
                    }
                    if (service && service['service_id']) {
                        self.delivery_address = service['to_address'];
                        let service_charge = self.pos.service_charge_by_id[service['service_id']];
                        let product = self.pos.db.get_product_by_id(service_charge['product_id'][0]);
                        if (product) {
                            self.add_shipping_cost(service_charge, product, true)
                        }
                    }
                }, function (err) {
                    return self.pos.query_backend_fail(err)
                })
            }
            let pricelistOfClient = null
            if (client) {
                pricelistOfClient = _.findWhere(this.pos.pricelists, {
                    id: client.property_product_pricelist[0],
                }) || this.pos.default_pricelist
                if (pricelistOfClient) {
                    this.set_pricelist(pricelistOfClient)
                }
            } else {
                this.set_pricelist(this.pos.default_pricelist)
            }
            this.pos.trigger('refresh.customer.facing.screen');
            if (client) {
                this.pos.alert_message({
                    title: _t('Successfully'),
                    body: client['name'] + _t(' Set to order !')
                })
            } else {
                this.pos.alert_message({
                    title: _t('Successfully'),
                    body: _t('Deselected Customer !')
                })
            }
            return res
        },
        add_shipping_cost: function (service, product, is_shipping_cost) {
            if (service['type'] == 'fixed') {
                this.add_product(product, {
                    price: service.amount,
                    quantity: 1,
                    merge: false,
                    extras: {
                        service_id: service.id,
                    }
                });
                this.pos.chrome.showNotification(_t('Add Service Charge Amount'), this.pos.format_currency(service.amount))
            } else {
                let amount_total = 0
                if (this.pos.config.service_charge_type == 'tax_included') {
                    amount_total = this.get_total_with_tax();
                } else {
                    amount_total = this.get_total_without_tax();
                }
                if (amount_total > 0) {
                    product['taxes_id'] = []
                    let price = amount_total * service.amount / 100
                    this.add_product(product, {
                        price: price,
                        quantity: 1,
                        merge: false,
                        extras: {
                            service_id: service.id,
                        }
                    });
                    this.pos.chrome.showNotification(_t('Add Service Charge Amount'), this.pos.format_currency(amount_total))
                }

            }
            let selected_line = this.get_selected_orderline();
            selected_line.is_shipping_cost = is_shipping_cost;
            selected_line.service_id = service.id;
            selected_line.trigger('change', selected_line)
        },
        validate_global_discount: function () {
            let self = this;
            let client = this && this.get_client();
            if (client && client['discount_id']) {
                this.pos.gui.show_screen('products');
                this.discount = this.pos.discount_by_id[client['discount_id'][0]];
                this.pos.gui.show_screen('products');
                let body = client['name'] + ' have discount ' + self.discount['name'] + '. Do you want to apply ?';
                return Gui.showPopup('ConfirmPopup', {
                    'title': _t('Customer special discount ?'),
                    'body': body,
                    confirm: function () {
                        self.add_global_discount(self.discount);
                        self.pos.gui.show_screen('payment');
                        self.validate_payment();
                    },
                    cancel: function () {
                        self.pos.gui.show_screen('payment');
                        self.validate_payment();
                    }
                });
            } else {
                this.validate_payment();
            }
        },
        validate_payment_order: function () {
            let self = this;
            let client = this.get_client();
            if (this && this.orderlines.models.length == 0) {
                this.pos.gui.show_screen('products');
                return this.pos.alert_message({
                    title: _t('Warning'),
                    body: _t('Your order is blank cart'),
                })
            } else {
                if (this.get_total_with_tax() == 0) {
                    this.pos.alert_message({
                        title: _t('Warning'),
                        body: _t('Your order have total paid is 0, please take careful')
                    })
                }
            }
            if (this.remaining_point && this.remaining_point < 0) {
                this.pos.gui.show_screen('products');
                return this.pos.alert_message({
                    title: _t('Warning'),
                    body: _t('You could not applied redeem point bigger than client point'),
                });
            }
            this.validate_order_return();
            if (!this.is_return) {
                this.validate_promotion();
            }
            if (this.is_to_invoice() && !this.get_client()) {
                this.pos.gui.show_screen('clientlist');
                this.pos.alert_message({
                    title: _t('Warning'),
                    body: _t('Please add client the first')
                });
                return false;
            }
            return true
        },
        validate_order_return: function () {
            if (this.pos.config.required_reason_return) {
                let line_missed_input_return_reason = _.find(this.orderlines.models, function (line) {
                    return line.get_price_with_tax() < 0 && !line.has_input_return_reason();
                });
                if (line_missed_input_return_reason) {
                    this.pos.gui.show_screen('products');
                    return this.pos.alert_message({
                        title: _t('Alert'),
                        body: _t('Please input return reason for each line'),
                    });
                } else {
                    return false
                }
            } else {
                return false
            }
        },
        get_total_discounts: function () {
            let total_discounts = this.orderlines.reduce((function (sum, orderLine) {
                sum += (orderLine.get_unit_price() * (orderLine.get_discount() / 100) * orderLine.get_quantity());
                if (orderLine.display_discount_policy() === 'without_discount') {
                    sum += ((orderLine.get_lst_price() - orderLine.get_unit_price()) * orderLine.get_quantity());
                }
                return sum;
            }), 0);
            this.orderlines.forEach(l => {
                if (l.price_extra) {
                    if (l.price_extra <= 0) {
                        total_discounts += -l.price_extra
                    } else {
                        total_discounts += l.price_extra
                    }
                }
            })
            return total_discounts
        },
        set_discount_price: function (price_will_discount, tax) {
            if (tax.include_base_amount) {
                let line_subtotal = this.get_price_with_tax() / this.quantity;
                let tax_before_discount = (line_subtotal - line_subtotal / (1 + tax.amount / line_subtotal));
                let price_before_discount = line_subtotal - tax_before_discount; // b
                let tax_discount = price_will_discount - price_will_discount / (1 + tax.amount / price_will_discount);
                let price_discount = price_will_discount - tax_discount; // d
                let price_exincluded_discount = price_before_discount - price_discount;
                let new_tax_wihtin_discount = price_exincluded_discount - price_exincluded_discount / (1 + tax.amount / price_exincluded_discount);
                let new_price_wihtin_discount = line_subtotal - price_will_discount;
                let new_price_without_tax = new_price_wihtin_discount - new_tax_wihtin_discount;
                let new_price_within_tax = new_price_without_tax + new_tax_wihtin_discount;
                this.set_unit_price(new_price_within_tax);
            } else {
                let tax_discount = tax.amount / 100 * price_will_discount;
                let price_discount = price_will_discount - tax_discount;
                let new_price_within_tax = this.price - price_discount - (0.91 * (parseInt(price_will_discount / 100)));
                this.set_unit_price(new_price_within_tax);
            }
        },
        add_global_discount: function (discount) {
            const amount_withtax = this.get_total_with_tax();
            if (amount_withtax <= 0) {
                return this.pos.alert_message({
                    title: _t('Error'),
                    body: _t('Total Amount Order smaller than or equal 0, not possible add Discount'),
                })
            }
            let lines = this.orderlines.models;
            if (!lines.length) {
                return this.pos.alert_message({
                    title: _t('Warning'),
                    body: _t('Your order is blank cart'),
                })
            }
            if (discount.type == 'percent') {
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    line.discount_extra = discount.amount;
                    line.trigger('change', line)
                }
            } else {
                if (amount_withtax < discount) {
                    discount = amount_withtax
                }
                const linesHasAmountSmallerThan0 = lines.filter(l => l.get_price_with_tax() < 0)
                if (linesHasAmountSmallerThan0 && linesHasAmountSmallerThan0.length > 0) {
                    return this.pos.alert_message({
                        title: _t('Error'),
                        body: _t('Could not applied Global Discount if have one Line have Amount smaller than 0'),
                    })
                }
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    let percent_disc = line.get_price_with_tax() / amount_withtax
                    line.price_extra = -percent_disc * discount['amount'];
                    line.trigger('change', line)

                }
            }
        },
        clear_discount_extra: function () {
            let lines = this.orderlines.models;
            lines.forEach(l => {
                l.discount_extra = 0
                l.price_extra = 0
                l.set_unit_price(l.product.get_price(l.order.pricelist, l.get_quantity()))
            })
        },
        async set_discount_value(discount) {
            // todo: will check discount bigger than limited discount or not? If bigger than, call admin confirm it
            if (!this.pos.config.discount_global_id) {
                return Gui.showPopup('ErrorPopup', {
                    title: this.pos.env._t('Warning'),
                    body: this.pos.env._t('Your POS Config not set Discount Product Value. Please go to Security and Discount [Tab] of POS Config and add it')
                });
            }
            if (!this.pos.db.get_product_by_id(this.pos.config.discount_global_id[0])) {
                return Gui.showPopup('ErrorPopup', {
                    title: this.pos.env._t('Warning'),
                    body: this.pos.config.discount_global_id[1] + this.pos.env._t(' not Available in POS or Sale Ok is uncheck')
                });
            }
            const discountProduct = this.pos.db.product_by_id[this.pos.config.discount_global_id[0]];
            const order = this;
            if (!discountProduct) {
                return Gui.showPopup('ErrorPopup', {
                    title: this.pos.env._t('Error'),
                    body: this.pos.config.discount_global_id[1] + this.pos.env._t(' not available in POS')
                });
            } else {
                order.orderlines.models.forEach(l => {
                    if (l.product && l.product.id == discountProduct['id']) {
                        order.remove_orderline(l)
                    }
                })
                order.orderlines.models.forEach(l => {
                    if (l.product && l.product.id == discountProduct['id']) {
                        order.remove_orderline(l)
                    }
                })
            }
            let lines = order.get_orderlines();
            let total_withtax = this.get_total_with_tax();
            let total_qty = 0
            lines.forEach(l => {
                total_qty += l.quantity
            })
            if (discount < 0) {
                return Gui.showPopup('ErrorPopup', {
                    title: _t('Error'),
                    body: _t('It not possible set Discount Value smaller than 0')
                })
            }
            if (discount > total_withtax) {
                discount = total_withtax
            }
            const amountWithTax = this.get_total_with_tax();
            lines = lines.filter(l => l.get_price_with_tax() > 0 && l.quantity > 0)
            if (this.pos.config.discount_limit && this.pos.config.discount_value_limit < discount) {
                let confirm = await this.pos._validate_action(_t('Add Discount Value'));
                if (!confirm) {
                    return Gui.showPopup('ErrorPopup', {
                        title: this.pos.env._t('Warning'),
                        body: this.pos.env._t('Required Manager Approved this Discount because this Discount bigger than Discount Value Limit on POS Setting')
                    });
                } else {
                    this._appliedDiscountValue(lines, discount, amountWithTax)
                }
            } else {
                this._appliedDiscountValue(lines, discount, amountWithTax)
            }
        },

        _appliedDiscountValue(lines, discount, amount_withtax) {
            // todo: old version
            // let balance_discount = discount
            // for (let i = 0; i < lines.length; i++) {
            //     let line = lines[i];
            //     if ((i + 1) == lines.length) {
            //         line['price_extra'] = -balance_discount
            //         line.trigger('change', line)
            //         break
            //     } else {
            //         let percent_disc = line.get_price_with_tax() / amount_withtax
            //         let newPrice = line.product.get_price(line.order.pricelist, line.get_quantity()) - (percent_disc * discount / line.get_quantity())
            //         let differencePrice = parseInt(line.product.get_price(line.order.pricelist, line.get_quantity()) - newPrice)
            //         balance_discount -= differencePrice
            //         line.price_manually_set = true
            //         line['price_extra'] = -differencePrice
            //         line.trigger('change', line)
            //     }
            // }
            // todo: new version
            let discountProduct = this.pos.db.product_by_id[this.pos.config.discount_global_id[0]];
            if (discountProduct) {
                this.add_product(discountProduct, {quantity: -1, merge: false});
                let selectedLine = this.get_selected_orderline();
                selectedLine.price_manually_set = true;
                selectedLine.set_unit_price(discount);
                this.pos.alert_message({
                    title: _t('Successfully'),
                    body: this.pos.format_currency(discount) + _t(' Discount Amount, Just Added to Order')
                })
                return true
            } else {
                return false
            }
        },
        set_to_invoice: function (to_invoice) {
            if (to_invoice) {
                this.add_credit = false;
                this.trigger('change');
            }
            return _super_Order.set_to_invoice.apply(this, arguments);
        },
        is_add_credit: function () {
            return this.add_credit
        },
        add_order_credit: function () {
            this.add_credit = !this.add_credit;
            if (this.add_credit) {
                this.set_to_invoice(false);
            }
            this.trigger('change');
            if (this.add_credit && !this.get_client()) {
                this.pos.gui.show_screen('clientlist');
                return this.pos.alert_message({
                    title: _t('Warning'),
                    body: 'Please add customer need add credit'
                })
            }
        },
        is_email_invoice: function () { // send email invoice or not
            return this.email_invoice;
        },
        set_email_invoice: function (email_invoice) {
            this.assert_editable();
            this.email_invoice = email_invoice;
            this.set_to_invoice(email_invoice);
        },
        get_root_category_by_category_id: function (category_id) { // get root of category, root is parent category is null
            let root_category_id = category_id;
            let category_parent_id = this.pos.db.category_parent[category_id];
            if (category_parent_id) {
                root_category_id = this.get_root_category_by_category_id(category_parent_id)
            }
            return root_category_id
        },
        // odoo wrong when compute price with tax have option price included
        // and now i fixing
        fix_tax_included_price: function (line) {
            this.syncing = true;
            _super_Order.fix_tax_included_price.apply(this, arguments);
            if (this.fiscal_position) {
                let unit_price = line.product['lst_price'];
                let taxes = line.get_taxes();
                let mapped_included_taxes = [];
                _(taxes).each(function (tax) {
                    let line_tax = line._map_tax_fiscal_position(tax);
                    if (tax.price_include && tax.id != line_tax.id) {
                        mapped_included_taxes.push(tax);
                    }
                });
                if (mapped_included_taxes.length > 0) {
                    unit_price = line.compute_all(mapped_included_taxes, unit_price, 1, this.pos.currency.rounding, true).total_excluded;
                    line.set_unit_price(unit_price);
                }
            }
            this.syncing = false;
        },
        set_signature: function (signature) {
            this.signature = signature;
            this.trigger('change', this);
        },
        get_signature: function () {
            if (this.signature) {
                return 'data:image/png;base64, ' + this.signature
            } else {
                return null
            }
        },
        set_note: function (note) {
            this.note = note;
            this.trigger('change', this);
        },
        get_note: function () {
            return this.note;
        },
        active_button_add_wallet: function (active) {
            let $add_wallet = $('.add_wallet');
            if (!$add_wallet) {
                return;
            }
            if (active) {
                $add_wallet.removeClass('oe_hidden');
                $add_wallet.addClass('highlight')
            } else {
                $add_wallet.addClass('oe_hidden');
            }
        },
        get_due_without_rounding: function (paymentline) {
            if (!paymentline) {
                let due = this.get_total_with_tax() - this.get_total_paid();
            } else {
                let due = this.get_total_with_tax();
                let lines = this.paymentlines.models;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i] === paymentline) {
                        break;
                    } else {
                        due -= lines[i].get_amount();
                    }
                }
            }
            return due;
        },
        generate_unique_ean13: function (array_code) {
            if (array_code.length != 12) {
                return -1
            }
            let evensum = 0;
            let oddsum = 0;
            for (let i = 0; i < array_code.length; i++) {
                if ((i % 2) == 0) {
                    evensum += parseInt(array_code[i])
                } else {
                    oddsum += parseInt(array_code[i])
                }
            }
            let total = oddsum * 3 + evensum;
            return parseInt((10 - total % 10) % 10)
        },
        get_product_image_url: function (product) {
            return window.location.origin + '/web/image?model=product.product&field=image_128&id=' + product.id;
        },
        _covert_pos_line_to_sale_line: function (line) {
            let product = this.pos.db.get_product_by_id(line.product_id);
            let line_val = {
                product_id: line.product_id,
                price_unit: line.price_unit,
                product_uom_qty: line.qty,
                discount: line.discount,
                product_uom: product.uom_id[0],
            };
            if (line.uom_id) {
                line_val['product_uom'] = line.uom_id
            }
            if (line.variants) {
                line_val['variant_ids'] = [[6, false, []]];
                for (let j = 0; j < line.variants.length; j++) {
                    let variant = line.variants[j];
                    line_val['variant_ids'][0][2].push(variant.id)
                }
            }
            if (line.tax_ids) {
                line_val['tax_id'] = line.tax_ids;
            }
            if (line.note) {
                line_val['pos_note'] = line.note;
            }
            return [0, 0, line_val];
        },
        _final_and_print_booking_order: function (result) {
            let order = this.pos.get_order();
            this.pos.set('order', order);
            this.pos.db.remove_unpaid_order(order);
            this.pos.db.remove_order(order['uid']);
            order.name = result['name'];
            order.uid = result['name']
            order.booking_uid = result['name']
            order.temporary = true;
            order.trigger('change', order);
            let booking_link = window.location.origin + "/web#id=" + result.id + "&view_type=form&model=sale.order";
            window.open(booking_link, '_blank');
        },
        ask_cashier_generic_options: function () {
            let self = this;
            let selected_orderline = this.get_selected_orderline();
            let generic_options = selected_orderline.get_product_generic_options()
            if (generic_options.length) {
                if (selected_orderline.generic_options) {
                    for (let i = 0; i < generic_options.length; i++) {
                        let generic_option = generic_options[i];
                        let generic_option_selected = _.find(selected_orderline.generic_options, function (generic) {
                            return generic.id == generic_option.id
                        })
                        if (generic_option_selected) {
                            generic_option.selected = true
                        } else {
                            generic_option.selected = false
                        }
                    }
                }
                return Gui.showPopup('popup_selection_extend', {
                    title: _t('Please select Generic Option for: ' + selected_orderline.product.display_name),
                    fields: ['name', 'price_extra'],
                    sub_datas: generic_options,
                    sub_search_string: this.pos.db.generic_options,
                    sub_record_by_id: this.pos.generic_option_by_id,
                    multi_choice: true,
                    sub_template: 'GenericOptionList',
                    body: _t('Please select Generic Option for: ' + selected_orderline.product.display_name),
                    confirm: function (generic_option_ids) {
                        if (generic_option_ids.length == 0) {
                            setTimeout(function () {
                                self.ask_cashier_generic_options();
                            }, 1000)
                            return this.pos.alert_message({
                                title: _t('Warning'),
                                body: _t('Required select one Generic Option')
                            })
                        } else {
                            self.get_selected_orderline().set_generic_options(generic_option_ids);
                        }
                    },
                    cancel: function () {
                        setTimeout(function () {
                            self.ask_cashier_generic_options();
                        }, 1000)
                        return this.pos.alert_message({
                            title: _t('Warning'),
                            body: _t('Required select one Generic Option')
                        })

                    }
                })
            } else {
                return true
            }
        },
        remove_orderline: async function (line) {
            if (this.pos.config.validate_remove_line && !this.syncing && !this.pos.the_first_load) {
                let validate = await this.pos._validate_action(this.pos.env._t('Remove Line'));
                if (!validate) {
                    return false;
                }
            }
            let res = _super_Order.remove_orderline.apply(this, arguments);
            if (line.coupon_ids && !this.pos.the_first_load) {
                this.pos.rpc({
                    model: 'coupon.generate.wizard',
                    method: 'remove_giftcards',
                    args: [[], line.coupon_ids],
                })
                this.pos.alert_message({
                    title: this.pos.env._t('Alert'),
                    body: this.pos.env._t('Gift cards created before just removed')
                })
            }
            return res
        },
        async getProductRecommendations(product) {
            const product_recommendation_number = this.pos.config.product_recommendation_number || 10
            const productRecommendationsIds = await rpc.query({
                model: 'pos.order.line',
                method: 'getProductRecommendations',
                args: [[], product.id, product_recommendation_number],
                context: {}
            }, {
                shadow: true,
                timeout: 10000,
            })
            this.pos.set('ProductRecommendations', productRecommendationsIds)
            if (productRecommendationsIds.length > 0) {
                console.log('[productRecommendationsIds] total products: ' + productRecommendationsIds.length)
            }
        },

        add_product: async function (product, options) {
            if (!options) {
                options = {}
            }
            if (!this.pos.config.allow_add_product) {
                return this.pos.alert_message({
                    title: this.pos.env._t('Alert'),
                    body: this.pos.env._t('Your POS Setting not active add products to cart')
                })
            }

            function check_condition_apply_sale_limit_time(pos, pos_category) {
                if (pos_category.submit_all_pos) {
                    return true
                } else {
                    if (pos_category.pos_branch_ids.length) {
                        if (!pos.config.pos_branch_id) {
                            return true
                        } else {
                            return (pos_category.pos_branch_ids.indexOf(pos.config.pos_branch_id[0]) != -1)
                        }
                    } else {
                        if (pos_category.pos_config_ids) {
                            return (pos_category.pos_config_ids.indexOf(pos.config.id) != -1)
                        } else {
                            return false
                        }
                    }
                }
            }

            if (product && product['pos_categ_id']) {
                let pos_category = this.pos.pos_category_by_id[product['pos_categ_id'][0]];
                if (pos_category && pos_category.sale_limit_time) {
                    let can_apply = check_condition_apply_sale_limit_time(this.pos, pos_category);
                    if (can_apply) {
                        let limit_sale_from_time = pos_category.from_time;
                        let limit_sale_to_time = pos_category.to_time;
                        let date_now = new Date();
                        let current_time = date_now.getHours() + date_now.getMinutes() / 600;
                        if (current_time >= limit_sale_from_time && current_time <= limit_sale_to_time) {
                            return this.pos.alert_message({
                                title: this.pos.env._t('Warning'),
                                body: pos_category.name + _(': Blocked Sale this time !!!')
                            })
                        }
                    }
                }
            }
            let newDescription = []
            if (product.addon_id) {
                newDescription.push(product['addon_id'][1])
            }
            if (product.model_id) {
                newDescription.push(product['model_id'][1])
            }
            if (product.sex_id) {
                newDescription.push(product['sex_id'][1])
            }
            if (product.college_id) {
                newDescription.push(product['college_id'][1])
            }
            let extendDescription = newDescription.join('/');
            if (extendDescription != "") {
                options['description'] = options['description'] + extendDescription
            }
            let res = _super_Order.add_product.call(this, product, options);
            let selected_orderline = this.get_selected_orderline();
            let combo_items = [];
            if (selected_orderline) {
                // TODO: auto set hardcode combo items
                for (let i = 0; i < this.pos.combo_items.length; i++) {
                    let combo_item = this.pos.combo_items[i];
                    if (combo_item.product_combo_id[0] == selected_orderline.product.product_tmpl_id && (combo_item.default == true || combo_item.required == true)) {
                        combo_items.push(combo_item);
                    }
                }
                if (combo_items) {
                    selected_orderline.set_combo_bundle_pack(combo_items)
                }
                // TODO: auto set dynamic combo items
                if (selected_orderline.product.product_tmpl_id) {
                    let default_combo_items = this.pos.combo_limiteds_by_product_tmpl_id[selected_orderline.product.product_tmpl_id];
                    if (default_combo_items && default_combo_items.length) {
                        let selected_combo_items = {};
                        for (let i = 0; i < default_combo_items.length; i++) {
                            let default_combo_item = default_combo_items[i];
                            if (default_combo_item.default_product_ids.length) {
                                for (let j = 0; j < default_combo_item.default_product_ids.length; j++) {
                                    selected_combo_items[default_combo_item.default_product_ids[j]] = 1
                                }
                            }
                        }
                        selected_orderline.set_dynamic_combo_items(selected_combo_items);
                    }

                }
                if (product.note_ids) {
                    let notes = '';
                    for (let i = 0; i < product.note_ids.length; i++) {
                        let note = this.pos.note_by_id[product.note_ids[i]];
                        if (!notes) {
                            notes = note.name
                        } else {
                            notes += ', ' + note.name;
                        }
                    }
                    if (notes) {
                        selected_orderline.set_line_note(notes)
                    }
                }
                if (product.tag_ids) {
                    selected_orderline.set_tags(product.tag_ids)
                }
            }
            if (this.pos.config.mrp && selected_orderline && selected_orderline.is_has_bom()) {
                let boms = selected_orderline.is_has_bom();
                if (boms.length = 1) {
                    let bom = boms[0]
                    let bom_line_ids = bom.bom_line_ids;
                    let bom_lines = [];
                    for (let i = 0; i < bom_line_ids.length; i++) {
                        bom_lines.push({
                            id: bom_line_ids[i].id,
                            quantity: bom_line_ids[i].product_qty,
                        })
                    }
                    if (bom_lines.length) {
                        selected_orderline.set_bom_lines(bom_lines)
                    }
                }
            }
            const $p = $('article[data-product-id="' + product.id + '"]');
            $($p).animate({
                'opacity': 0.5,
            }, 300, function () {
                $($p).animate({
                    'opacity': 1,
                }, 300);
            });
            let imgtodrag = $p.children('div').find("img").eq(0)
            if (this.pos.config.product_view == 'list') {
                const $p = $('tr[data-product-id="' + product.id + '"]')
                imgtodrag = $p.children('td').find("img")
            }
            let cart_list = $('tr[data-line-product-id="' + product.id + '"]')
            if (this.pos.env.isMobile) {
                cart_list = $('.btn-switchpane.secondary')
            }
            if (cart_list && cart_list.length != 1) {
                cart_list = $('.open-cart')
            }
            if (imgtodrag && imgtodrag.length && cart_list && cart_list.length == 1) {
                let imgclone = imgtodrag.clone()
                    .offset({
                        top: imgtodrag.offset().top,
                        left: imgtodrag.offset().left
                    })
                    .css({
                        'opacity': '1',
                        'position': 'absolute',
                        'height': '50px',
                        'width': '150px',
                        'z-index': '100'
                    })
                    .appendTo($('body'))
                    .animate({
                        'top': cart_list.offset().top,
                        'left': cart_list.offset().left,
                        'width': 75,
                        'height': 50
                    }, 1000, 'easeInOutExpo');
                imgclone.animate({
                    'width': 0,
                    'height': 0
                }, function () {
                    $(this).detach()
                });
            }
            if (selected_orderline && selected_orderline.product && selected_orderline.product.pos_categ_id) {
                const posCategory = this.pos.pos_category_by_id[selected_orderline.product.pos_categ_id[0]]
                if (posCategory && posCategory['category_type'] == 'main') {
                    selected_orderline.mp_dbclk_time = new Date().getTime();
                    selected_orderline.set_skip(true);
                }
            }
            if (selected_orderline && this.pos.config.product_recommendation) {
                this.getProductRecommendations(selected_orderline.product)
            }
            return res
        },
        validation_order_can_do_internal_transfer: function () {
            let can_do = true;
            for (let i = 0; i < this.orderlines.models.length; i++) {
                let product = this.orderlines.models[i].product;
                if (product['type'] == 'service' || product['uom_po_id'] == undefined) {
                    can_do = false;
                }
            }
            if (this.orderlines.models.length == 0) {
                can_do = false;
            }
            return can_do;
        },
        update_product_price: function (pricelist) {
            let self = this;
            let products = this.pos.db.getAllProducts();
            if (!products) {
                return;
            }
            for (let i = 0; i < products.length; i++) {
                let product = products[i];
                let price = product.get_price(pricelist, 1);
                product['price'] = price;
            }
            self.pos.trigger('product:change_price_list', products)
        },
        get_total_items: function () {
            let total_items = 0;
            for (let i = 0; i < this.orderlines.models.length; i++) {
                total_items += this.orderlines.models[i].quantity;
            }
            return total_items;
        },
        set_tags: function () {
            if (this && this.selected_orderline) {
                let selected_orderline = this.selected_orderline;
                return Gui.showPopup('popup_selection_tags', {
                    selected_orderline: selected_orderline,
                    title: this.pos.env._t('Add Tags')
                });
            } else {
                return this.pos.alert_message({
                    title: this.pos.env._t('Warning'),
                    body: this.pos.env._t('Your shopping cart is empty'),
                })
            }
        },
        set_seller: function () {
            let self = this;
            let sellers = this.pos.sellers;
            return Gui.showPopup('popup_selection_extend', {
                title: this.pos.env._t('Select one Seller'),
                fields: ['name', 'email', 'id'],
                sub_datas: sellers,
                sub_template: 'sale_persons',
                body: this.pos.env._t('Please select one sale person'),
                confirm: function (user_id) {
                    let seller = self.pos.user_by_id[user_id];
                    let order = self.pos.get_order();
                    if (order && order.get_selected_orderline()) {
                        return order.get_selected_orderline().set_sale_person(seller)
                    } else {
                        self.pos.alert_message({
                            title: self.pos.env._t('Warning'),
                            body: self.pos.env._t('Have not Line selected, please select one line before add seller')
                        })
                    }
                }
            })
        },
        change_taxes: function () {
            let order = this;
            let self = this;
            let taxes = [];
            let update_tax_ids = this.pos.config.update_tax_ids || [];
            for (let i = 0; i < this.pos.taxes.length; i++) {
                let tax = this.pos.taxes[i];
                if (update_tax_ids.indexOf(tax.id) != -1) {
                    taxes.push(tax)
                }
            }
            if (order.get_selected_orderline() && taxes.length) {
                let line_selected = order.get_selected_orderline();
                return Gui.showPopup('popup_select_tax', {
                    title: self.pos.env._t('Please choose tax'),
                    line_selected: line_selected,
                    taxes: taxes,
                    confirm: function () {
                        return self.pos.gui.close_popup(); // kianh
                    },
                    cancel: function () {
                        return self.pos.gui.close_popup(); // kianh
                    }
                });
            } else {
                return this.pos.alert_message({
                    title: this.pos.env._t('Warning'),
                    body: ('Please select line before add taxes or update taxes on pos config not setting')
                });
            }
        },
        async create_voucher() {
            let number = await this.pos._getVoucherNumber()
            const {confirmed, payload} = await Gui.showPopup('PopUpPrintVoucher', {
                title: _t('Create Voucher'),
                number: number,
                value: 0,
                period_days: this.pos.config.expired_days_voucher,
            });
            if (confirmed) {
                let values = payload.values;
                let error = payload.error;
                if (!error) {
                    let voucher = await rpc.query({
                        model: 'pos.voucher',
                        method: 'create_from_ui',
                        args: [[], values],
                        context: {}
                    })
                    let url_location = window.location.origin + '/report/barcode/EAN13/';
                    voucher['url_barcode'] = url_location + voucher['code'];
                    let report_html = qweb.render('VoucherCard', this.pos._get_voucher_env(voucher));
                    this.pos.chrome.showScreen('ReportScreen', {
                        report_html: report_html
                    });
                } else {
                    this.pos.alert_message({
                        title: _t('Alert'),
                        body: error,
                    })
                }
            }
        },
        manual_set_promotions: function () {
            let order = this;
            let promotion_manual_select = this.pos.config.promotion_manual_select;
            if (!promotion_manual_select) {
                order.apply_promotion()
            } else {
                let promotion_datas = order.get_promotions_active();
                let promotions_active = promotion_datas['promotions_active'];
                if (promotions_active.length) {
                    return Gui.showPopup('popup_selection_promotions', {
                        title: _t('Alert'),
                        body: _t('Please choice promotions need to apply'),
                        promotions_active: promotions_active
                    })
                } else {
                    return this.pos.alert_message({
                        title: _t('Warning'),
                        body: _t('Nothing Promotions active'),
                    })
                }

            }
        },
        set_redeem_point: function (line, new_price, point) {
            line.redeem_point = round_pr(point, this.pos.retail_loyalty.rounding);
            line.plus_point = 0;
            if (new_price != null) {
                line.price = new_price;
            }
            line.trigger_update_line();
            line.trigger('change', line);
            line.order.trigger('change', line.order)
        },
        async setRewardProgram(reward) {
            let loyalty = this.pos.retail_loyalty;
            let product = this.pos.db.get_product_by_id(loyalty.product_loyalty_id[0]);
            if (!product) {
                let resultUpdate = await this.pos.rpc({
                    model: 'product.product',
                    method: 'force_write',
                    args: [[loyalty.product_loyalty_id[0]], {
                        'available_in_pos': true,
                        'sale_ok': true,
                        'active': true,
                    }],
                    context: {}
                })
                if (resultUpdate) {
                    await this.pos.syncProductsPartners();
                } else {
                    return Gui.showPopup('ErrorPopup', {
                        title: _t('Error'),
                        body: loyalty.product_loyalty_id[1] + _t(' not set Available In POS, it not possible apply Reward.')
                    })
                }
            }
            this.orderlines.models.forEach(l => {
                if (l.product && l.product.id == product['id']) {
                    this.remove_orderline(l)
                }
            })
            let applied = false;
            let lines = this.orderlines.models;
            if (lines.length == 0 && reward['type'] != 'gift') {
                return Gui.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Your order is blank cart'),
                })
            }
            let total_with_tax = this.get_total_with_tax();
            let redeem_point_used = this.build_redeem_point();
            let client = this.get_client();
            if (reward['min_amount'] > total_with_tax) {
                return Gui.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: 'Reward ' + reward['name'] + ' required min amount bigger than ' + reward['min_amount'],
                })
            }
            if (client['pos_loyalty_point'] <= redeem_point_used) {
                return Gui.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Point of customer not enough'),
                })
            }
            if ((reward['type'] == 'discount_products' || reward['type'] == 'discount_categories') && (reward['discount'] <= 0 || reward['discount'] > 100)) {
                return Gui.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Reward discount required set discount bigger or equal 0 and smaller or equal 100')
                })
            }
            if (reward['type'] == 'discount_products') {
                let point_redeem = 0;
                let amount_total = 0;
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (reward['discount_product_ids'].indexOf(line['product']['id']) != -1) {
                        amount_total += line.get_price_with_tax();
                    }
                }
                let point_will_redeem = amount_total * reward['discount'] / 100 / reward['coefficient'];
                let price_discount = amount_total * reward['discount'] / 100;
                if ((client['pos_loyalty_point'] > (point_will_redeem + redeem_point_used)) && price_discount) {
                    applied = true;
                    this.add_product(product, {
                        price: price_discount,
                        quantity: -1,
                        merge: false,
                        extras: {
                            reward_id: reward.id,
                            redeem_point: point_will_redeem
                        }
                    });
                    return Gui.showPopup('ConfirmPopup', {
                        title: _t('Successfully'),
                        body: _t('Set Discount: ') + this.pos.format_currency(price_discount)
                    })
                }
            } else if (reward['type'] == 'discount_categories') {
                let point_redeem = 0;
                let amount_total = 0;
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (reward['discount_category_ids'].indexOf(line['product']['pos_categ_id'][0]) != -1) {
                        amount_total += line.get_price_with_tax();
                    }
                }
                let point_will_redeem = amount_total * reward['discount'] / 100 / reward['coefficient'];
                let price_discount = amount_total * reward['discount'] / 100;
                if ((client['pos_loyalty_point'] > (point_will_redeem + redeem_point_used)) && price_discount) {
                    applied = true;
                    this.add_product(product, {
                        price: price_discount,
                        quantity: -1,
                        merge: false,
                        extras: {
                            reward_id: reward.id,
                            redeem_point: point_will_redeem
                        }
                    });
                    return Gui.showPopup('ConfirmPopup', {
                        title: _t('Successfully'),
                        body: _t('Set Discount: ') + this.pos.format_currency(price_discount)
                    })
                }
            } else if (reward['type'] == 'gift') {
                for (let item_index in reward['gift_product_ids']) {
                    let product_gift = this.pos.db.get_product_by_id(reward['gift_product_ids'][item_index]);
                    if (product_gift) {
                        let point_will_redeem = reward['coefficient'];
                        if (client['pos_loyalty_point'] > (point_will_redeem + redeem_point_used)) {
                            applied = true;
                            this.add_product(product_gift, {
                                price: 0,
                                quantity: reward['quantity'],
                                merge: false,
                                extras: {
                                    reward_id: reward.id,
                                    redeem_point: point_will_redeem
                                }
                            });
                            return Gui.showPopup('ConfirmPopup', {
                                title: _t('Successfully'),
                                body: _t('Set Gift: ') + product_gift.display_name
                            })
                        }
                    }
                }
            } else if (reward['type'] == 'resale' && reward['price_resale'] > 0) {
                let point_redeem = 0;
                let amount_total = 0;
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (reward['resale_product_ids'].indexOf(line['product']['id']) != -1) {
                        amount_total += (line.get_price_with_tax() / line.quantity - reward['price_resale']) * line.quantity;
                    }
                }
                let point_will_redeem = amount_total * reward['coefficient'];
                if (client['pos_loyalty_point'] > (point_will_redeem + redeem_point_used)) {
                    applied = true;
                    this.add_product(product, {
                        price: amount_total,
                        quantity: -1,
                        merge: false,
                        extras: {
                            reward_id: reward.id,
                            redeem_point: point_will_redeem
                        }
                    });
                    return Gui.showPopup('ConfirmPopup', {
                        title: _t('Successfully'),
                        body: _t('Set Discount: ') + this.pos.format_currency(amount_total)
                    })
                }
            } else if (reward['type'] == 'use_point_payment') {
                let title = 1 / reward['coefficient'] + _t(' points = 1 ') + this.pos.currency['name'] + _t(', Customer have total Points: ') + this.pos.format_currency_no_symbol(client['pos_loyalty_point']) + _t(' and Total Amount of Order is: ') + this.pos.format_currency(this.get_total_with_tax()) + _t('. Please input points Customer need use bellow')
                let pointCanUse = client['pos_loyalty_point'] * reward['coefficient']
                if (total_with_tax <= pointCanUse) {
                    pointCanUse = total_with_tax / reward['coefficient']
                }
                let {confirmed, payload: point} = await Gui.showPopup('NumberPopup', {
                    title: title,
                    startingValue: pointCanUse
                })
                if (confirmed) {
                    point = parseFloat(point);
                    let redeem_point_used = this.build_redeem_point();
                    let next_redeem_point = redeem_point_used + point;
                    if (point <= 0) {
                        let {confirmed, payload: confirm} = await Gui.showPopup('ConfirmPopup', {
                            title: _t('Warning'),
                            body: _t('Points redeem required bigger than 0, are you want input points again ?')
                        })
                        if (confirmed) {
                            return await this.setRewardProgram(reward)
                        } else {
                            return false
                        }
                    }
                    if (client['pos_loyalty_point'] < next_redeem_point) {
                        let {confirmed, payload: confirm} = await Gui.showPopup('ConfirmPopup', {
                            title: _t('Error'),
                            body: _t("It not Possible Redeem Points Bigger than Customer's Points. Are you want re-input points again ?")
                        })
                        if (confirmed) {
                            return await this.setRewardProgram(reward)
                        } else {
                            return false
                        }
                    } else {
                        let next_amount = total_with_tax - (point * reward['coefficient']);
                        if (next_amount >= 0) {
                            applied = true;
                            this.add_product(product, {
                                price: -(point * reward['coefficient']),
                                quantity: 1,
                                merge: false,
                                extras: {
                                    reward_id: reward.id,
                                    redeem_point: point
                                },
                                description: _t('Use ') + point * reward['coefficient'] + _t(' points payment.')
                            });
                            return Gui.showPopup('ConfirmPopup', {
                                title: _t('Successfully'),
                                body: _t('Covert ') + this.pos.format_currency_no_symbol(point) + _t(' Points to : ') + this.pos.format_currency(point * reward['coefficient'])
                            })
                        } else {
                            let {confirmed, payload: confirm} = await Gui.showPopup('ConfirmPopup', {
                                title: _t('Warning'),
                                body: _t('Total points can use require smaller than or equal :') + this.pos.format_currency_no_symbol(total_with_tax / reward['coefficient']),
                            })
                            if (confirmed) {
                                return await this.setRewardProgram(reward)
                            } else {
                                return false
                            }
                        }
                    }
                }
            }
        },
        lock_order: async function () {
            const order = this;
            if (order && order.table) {
                let result = await rpc.query({
                    model: 'restaurant.table',
                    method: 'lock_table',
                    args: [[order.table.id], {
                        'locked': true,
                    }],
                })
                if (result) {
                    const table = this.pos.tables.find(t => t.id == order.table.id)
                    table.locked = true;
                    this.pos.set_table(null)
                }
                if (this.pos.pos_bus) {
                    this.pos.pos_bus.send_notification({
                        data: {
                            order: order.export_as_JSON(),
                            table_id: order.table.id,
                            order_uid: order.uid,
                            lock: true,
                        },
                        action: 'lock_table',
                        order_uid: order.uid,
                    })
                }
            }
        },
        create_sale_order: function () {
            let order = this;
            let length = order.orderlines.length;
            if (!order.get_client()) {
                return this.pos.show_popup_clients('products');
            }
            if (length == 0) {
                return this.pos.alert_message({
                    title: _t('Warning'),
                    body: _t('Your order is blank cart'),
                });
            }
            if (order.get_total_with_tax() <= 0) {
                return this.pos.alert_message({
                    title: _t('Warning'),
                    body: _t("Amount total of order required bigger than 0"),
                });
            }
            return Gui.showPopup('popup_create_sale_order', {
                title: _t('Create Quotation/Sale Order'),
            });
        },

        // TODO: Promotion
        get_promotions_active: function () {
            if (this.is_return) {
                return {
                    can_apply: false,
                    promotions_active: []
                };
            }
            let can_apply = null;
            let promotions_active = [];
            if (!this.pos.promotions) {
                return {
                    can_apply: can_apply,
                    promotions_active: []
                };
            }
            for (let i = 0; i < this.pos.promotions.length; i++) {
                let promotion = this.pos.promotions[i];
                if (!this._checking_period_times_condition(promotion)) {
                    continue
                }
                let is_special_customer = this.checking_special_client(promotion);
                let is_birthday_customer = this.checking_promotion_birthday_match_birthdayof_client(promotion);
                let is_mem_of_promotion_group = this.checking_promotion_has_groups(promotion);
                if (promotion['type'] == '1_discount_total_order' && this.checking_apply_total_order(promotion) && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    can_apply = true;
                    promotions_active.push(promotion);
                } else if (promotion['type'] == '2_discount_category' && this.checking_can_discount_by_categories(promotion) && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    can_apply = true;
                    promotions_active.push(promotion);
                } else if (promotion['type'] == '3_discount_by_quantity_of_product' && this.checking_apply_discount_filter_by_quantity_of_product(promotion) && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    can_apply = true;
                    promotions_active.push(promotion);
                } else if (promotion['type'] == '4_pack_discount' && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    let promotion_condition_items = this.pos.promotion_discount_condition_by_promotion_id[promotion.id];
                    if (!promotion_condition_items) {
                        console.warn(promotion.name + 'have not rules');
                        continue
                    }
                    let checking_pack_discount_and_pack_free = this.checking_pack_discount_and_pack_free_gift(promotion, promotion_condition_items);
                    if (checking_pack_discount_and_pack_free) {
                        can_apply = true;
                        promotions_active.push(promotion);
                    }
                } else if (promotion['type'] == '5_pack_free_gift' && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    let promotion_condition_items = this.pos.promotion_gift_condition_by_promotion_id[promotion.id];
                    if (!promotion_condition_items) {
                        console.warn(promotion.name + 'have not rules');
                        continue
                    }
                    let checking_pack_discount_and_pack_free = this.checking_pack_discount_and_pack_free_gift(promotion, promotion_condition_items);
                    if (checking_pack_discount_and_pack_free) {
                        can_apply = checking_pack_discount_and_pack_free;
                        promotions_active.push(promotion);
                    }
                } else if (promotion['type'] == '6_price_filter_quantity' && this.checking_apply_price_filter_by_quantity_of_product(promotion) && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    can_apply = true;
                    promotions_active.push(promotion);
                } else if (promotion['type'] == '7_special_category' && this.checking_apply_specical_category(promotion) && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    can_apply = true;
                    promotions_active.push(promotion);
                } else if (promotion['type'] == '8_discount_lowest_price' && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    can_apply = true;
                    promotions_active.push(promotion);
                } else if (promotion['type'] == '9_multi_buy' && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    let check_multi_by = this.checking_multi_buy(promotion);
                    if (check_multi_by) {
                        can_apply = check_multi_by;
                        promotions_active.push(promotion);
                    }
                } else if (promotion['type'] == '10_buy_x_get_another_free' && this.checking_special_client(promotion) && this.checking_promotion_birthday_match_birthdayof_client(promotion)) {
                    let check_by_x_get_another_free = this.checking_buy_x_get_another_free(promotion);
                    if (check_by_x_get_another_free) {
                        can_apply = check_by_x_get_another_free;
                        promotions_active.push(promotion);
                    }
                } else if (promotion['type'] == '11_first_order' && this.checking_special_client(promotion) && this.checking_promotion_birthday_match_birthdayof_client(promotion)) {
                    let can_apply_promotion = this.checking_first_order_of_customer(promotion);
                    if (can_apply_promotion) {
                        can_apply = can_apply_promotion;
                        promotions_active.push(promotion);
                    }
                } else if (promotion['type'] == '12_buy_total_items_free_items' && this.checking_special_client(promotion) && this.checking_promotion_birthday_match_birthdayof_client(promotion)) {
                    let product_ids = promotion.product_ids;
                    if (!product_ids || product_ids.length == 0) {
                        console.warn(promotion.name + ' product_ids not set');
                        continue
                    }
                    let can_apply_promotion = this.checking_buy_total_items_free_items(promotion);
                    if (can_apply_promotion) {
                        can_apply = can_apply_promotion;
                        promotions_active.push(promotion);
                    }
                } else if (promotion['type'] == '13_gifts_filter_by_total_amount' && this.checking_special_client(promotion) && this.checking_promotion_birthday_match_birthdayof_client(promotion)) {
                    let can_apply_promotion = this.checking_gifts_filter_by_total_amount(promotion);
                    if (can_apply_promotion) {
                        can_apply = can_apply_promotion;
                        promotions_active.push(promotion);
                    }
                }
            }
            return {
                can_apply: can_apply,
                promotions_active: promotions_active
            };
        },
        apply_promotion: function (promotions) {
            this.promotionRunning = true;
            if (this.is_return) {
                return Gui.showPopup('ConfirmPopup', {
                    title: _t('Warning'),
                    body: _t('Return order not allow apply promotions'),
                });
            }
            if (!promotions) {
                promotions = this.get_promotions_active()['promotions_active'];
            }
            if (promotions.length) {
                this.remove_all_promotion_line();
                for (let i = 0; i < promotions.length; i++) {
                    let promotion = promotions[i]
                    let type = promotions[i].type
                    let order = this;
                    if (order.orderlines.length) {
                        if (type == '1_discount_total_order') {
                            order.compute_discount_total_order(promotion);
                        }
                        if (type == '2_discount_category') {
                            order.compute_discount_category(promotion);
                        }
                        if (type == '3_discount_by_quantity_of_product') {
                            order.compute_discount_by_quantity_of_products(promotion);
                        }
                        if (type == '4_pack_discount') {
                            order.compute_pack_discount(promotion);
                        }
                        if (type == '5_pack_free_gift') {
                            order.compute_pack_free_gift(promotion);
                        }
                        if (type == '6_price_filter_quantity') {
                            order.compute_price_filter_quantity(promotion);
                        }
                        if (type == '7_special_category') {
                            order.compute_special_category(promotion);
                        }
                        if (type == '8_discount_lowest_price') {
                            order.compute_discount_lowest_price(promotion);
                        }
                        if (type == '9_multi_buy') {
                            order.compute_multi_buy(promotion);
                        }
                        if (type == '10_buy_x_get_another_free') {
                            order.compute_buy_x_get_another_free(promotion);
                        }
                        if (type == '11_first_order') {
                            order.compute_first_order(promotion);
                        }
                        if (type == '12_buy_total_items_free_items') {
                            order.compute_buy_total_items_free_items(promotion);
                        }
                        if (type == '13_gifts_filter_by_total_amount') {
                            order.compute_gifts_filter_by_total_amount(promotion);
                        }
                        this.pos.chrome.showNotification(_t('Promotion Program') + promotion['name'], _t(' Applied to Order!!!'))
                    }
                }
                let applied_promotion = false;
                let total_promotion_line = 0;
                for (let i = 0; i < this.orderlines.models.length; i++) {
                    if (this.orderlines.models[i]['promotion'] == true) {
                        applied_promotion = true;
                        total_promotion_line += 1;
                    }
                }
                this.trigger('change', this);
                this.promotionRunning = false;
            } else {
                this.promotionRunning = false;
                return this.pos.alert_message({
                    title: _t('Warning'),
                    body: _t('Have not any Promotions Active'),
                });
            }
        },
        get_amount_total_without_promotion: function () {
            let lines = _.filter(this.orderlines.models, function (line) {
                return !line['is_return'] && !line['promotion']
            });
            let amount_total = 0;
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (this.pos.config.iface_tax_included === 'total') {
                    amount_total += line.get_price_with_tax();
                } else {
                    amount_total += line.get_price_without_tax();
                }
            }
            return amount_total;
        },
        remove_all_buyer_promotion_line: function () {
            let lines = this.orderlines.models;
            for (let n = 0; n < 2; n++) {
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (line['buyer_promotion']) {
                        this.orderlines.remove(line);
                    }
                }
            }
        },
        remove_all_promotion_line: function () {
            let lines = this.orderlines.models;
            for (let n = 0; n < 2; n++) {
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (line['promotion']) {
                        if (line.promotion && line.promotion_id && (line.promotion_discount || line.promotion_amount)) {
                            line.promotion = false;
                            line.promotion_id = null;
                            line.promotion_discount = null;
                            line.promotion_amount = null;
                            line.promotion_reason = null;
                            line.trigger('change', line)
                        } else {
                            this.orderlines.remove(line);
                        }
                    }
                }
            }
        },
        product_quantity_by_product_id: function () {
            let lines_list = {};
            let lines = this.orderlines.models;
            let i = 0;
            while (i < lines.length) {
                let line = lines[i];
                if (line.promotion) {
                    i++;
                    continue
                }
                if (!lines_list[line.product.id]) {
                    lines_list[line.product.id] = line.quantity;
                } else {
                    lines_list[line.product.id] += line.quantity;
                }
                i++;
            }
            return lines_list
        },
        total_price_by_product_id: function () {
            let total_price_by_product = {};
            for (let i = 0; i < this.orderlines.models.length; i++) {
                let line = this.orderlines.models[i];
                if (this.pos.config.iface_tax_included === 'total') {
                    if (!total_price_by_product[line.product.id]) {
                        total_price_by_product[line.product.id] = line.get_price_with_tax();
                    } else {
                        total_price_by_product[line.product.id] += line.get_price_with_tax();
                    }
                } else {
                    if (!total_price_by_product[line.product.id]) {
                        total_price_by_product[line.product.id] = line.get_price_without_tax();
                    } else {
                        total_price_by_product[line.product.id] += line.get_price_without_tax();
                    }
                }
            }
            return total_price_by_product;
        },
        checking_special_client: function (promotion) {
            /*
                Checking client selected have inside special customers of promotion
             */
            if (!promotion.special_customer_ids || promotion.special_customer_ids.length == 0) {
                return true
            } else {
                let order = this.pos.get_order();
                if (!order) {
                    return true
                } else {
                    let client = order.get_client();
                    if (!client && promotion.special_customer_ids.length) {
                        return false
                    } else {
                        let client_id = client.id;
                        if (promotion.special_customer_ids.indexOf(client_id) == -1) {
                            return false
                        } else {
                            return true
                        }
                    }
                }
            }
        },
        checking_promotion_birthday_match_birthdayof_client: function (promotion) {
            /*
                We checking 2 condition
                1. Promotion is promotion birthday
                2. Birthday of client isnide period time of promotion allow
             */
            if (!promotion.promotion_birthday) {
                return true
            } else {
                let client = this.get_client();
                let passed = false;
                if (client && client['birthday_date']) {
                    let birthday_date = moment(client['birthday_date']);
                    let today = moment(new Date());
                    if (promotion['promotion_birthday_type'] == 'day') {
                        if ((birthday_date.date() == today.date()) && (birthday_date.month() == today.month())) {
                            passed = true
                        }
                    }
                    if (promotion['promotion_birthday_type'] == 'week') {
                        let parts = client['birthday_date'].split('-');
                        let birthday_date = new Date(new Date().getFullYear() + '-' + parts[1] + '-' + parts[0]).getTime() + 86400000;
                        let startOfWeek = moment().startOf('week').toDate().getTime() + 86400000;
                        let endOfWeek = moment().endOf('week').toDate().getTime() + 86400000;
                        if (startOfWeek <= birthday_date && birthday_date <= endOfWeek) {
                            passed = true;
                        }
                    }
                    if (promotion['promotion_birthday_type'] == 'month') {
                        if (birthday_date.month() == today.month()) {
                            passed = true
                        }
                    }
                }
                return passed;
            }
        },
        checking_promotion_has_groups: function (promotion) {
            /*
                We checking 2 condition
                1. Promotion is promotion birthday
                2. Birthday of client isnide period time of promotion allow
             */
            if (!promotion.promotion_group) {
                return true
            } else {
                let client = this.get_client();
                let passed = false;
                if (promotion.promotion_group_ids.length && client && client.group_ids) {
                    for (let i = 0; i < client.group_ids.length; i++) {
                        let group_id = client.group_ids[i];
                        if (promotion['promotion_group_ids'].indexOf(group_id) != -1) {
                            passed = true;
                            break;
                        }
                    }
                }
                return passed;
            }
        },
        order_has_promotion_applied: function () {
            let promotion_line = _.find(this.orderlines.models, function (line) {
                return line.promotion == true;
            });
            if (promotion_line) {
                return true
            } else {
                return false
            }
        },
        // 1) check current order can apply discount by total order
        checking_apply_total_order: function (promotion) {
            let can_apply = false;
            let discount_lines = this.pos.promotion_discount_order_by_promotion_id[promotion.id];
            let total_order = this.get_amount_total_without_promotion();
            let discount_line_tmp = null;
            let discount_tmp = 0;
            if (discount_lines) {
                let i = 0;
                while (i < discount_lines.length) {
                    let discount_line = discount_lines[i];
                    if (total_order >= discount_line.minimum_amount && total_order >= discount_tmp) {
                        discount_line_tmp = discount_line;
                        discount_tmp = discount_line.minimum_amount
                        can_apply = true
                    }
                    i++;
                }
            }
            return can_apply && this.checking_special_client(promotion);
        },
        // 2) check current order can apply discount by categories
        checking_can_discount_by_categories: function (promotion) {
            let can_apply = false;
            let product = this.pos.db.get_product_by_id(promotion.product_id[0]);
            if (!product || !this.pos.promotion_by_category_id) {
                return false;
            }
            for (let i in this.pos.promotion_by_category_id) {
                let promotion_line = this.pos.promotion_by_category_id[i];
                let amount_total_by_category = 0;
                let z = 0;
                let lines = _.filter(this.orderlines.models, function (line) {
                    return !line['is_return'] && !line['promotion']
                });
                while (z < lines.length) {
                    if (!lines[z].product.pos_categ_id) {
                        z++;
                        continue;
                    }
                    if (lines[z].product.pos_categ_id[0] == promotion_line.category_id[0]) {
                        amount_total_by_category += lines[z].get_price_without_tax();
                    }
                    z++;
                }
                if (amount_total_by_category > 0) {
                    can_apply = true
                }
            }
            return can_apply && this.checking_special_client(promotion)
        },
        // 3_discount_by_quantity_of_product
        checking_apply_discount_filter_by_quantity_of_product: function (promotion) {
            let can_apply = false;
            let rules = this.pos.promotion_quantity_by_product_id;
            let product_quantity_by_product_id = this.product_quantity_by_product_id();
            for (let product_id in product_quantity_by_product_id) {
                let rules_by_product_id = rules[product_id];
                if (rules_by_product_id) {
                    for (let i = 0; i < rules_by_product_id.length; i++) {
                        let rule = rules_by_product_id[i];
                        if (rule && rule['promotion_id'][0] == promotion['id'] && product_quantity_by_product_id[product_id] >= rule.quantity) {
                            can_apply = true;
                        }
                    }
                }
            }
            return can_apply && this.checking_special_client(promotion);
        },
        // 4. & 5. : check pack free gift and pack discount product
        // 5_pack_free_gift && 4_pack_discount
        checking_pack_discount_and_pack_free_gift: function (promotion, rules) {
            let method = promotion.method;
            let active_one = false;
            let can_apply = true;
            let product_quantity_by_product_id = this.product_quantity_by_product_id();
            for (let i = 0; i < rules.length; i++) {
                let rule = rules[i];
                let product_id = rule.product_id[0];
                let minimum_quantity = rule.minimum_quantity;
                let total_qty_by_product = product_quantity_by_product_id[product_id];
                if ((total_qty_by_product && total_qty_by_product < minimum_quantity) || !total_qty_by_product) {
                    can_apply = false;
                }
                if (total_qty_by_product && total_qty_by_product >= minimum_quantity) {
                    active_one = true;
                }
            }
            if (active_one && method == 'only_one') {
                return active_one && this.checking_special_client(promotion)
            } else {
                return can_apply && this.checking_special_client(promotion)
            }
        },
        // 6. check condition for apply price filter by quantity of product
        checking_apply_price_filter_by_quantity_of_product: function (promotion) {
            let condition = false;
            let rules = this.pos.promotion_price_by_promotion_id[promotion.id];
            let product_quantity_by_product_id = this.product_quantity_by_product_id();
            for (let i = 0; i < rules.length; i++) {
                let rule = rules[i];
                if (rule && product_quantity_by_product_id[rule.product_id[0]] && product_quantity_by_product_id[rule.product_id[0]] >= rule.minimum_quantity) {
                    condition = true;
                }
            }
            return condition && this.checking_special_client(promotion);
        },
        // TODO: 7_special_category
        checking_apply_specical_category: function (promotion) {
            let condition = false;
            let promotion_lines = this.pos.promotion_special_category_by_promotion_id[promotion['id']];
            this.lines_by_category_id = {};
            for (let i = 0; i < this.orderlines.models.length; i++) {
                let line = this.orderlines.models[i];
                let pos_categ_id = line['product']['pos_categ_id'][0];
                if (pos_categ_id) {
                    if (!this.lines_by_category_id[pos_categ_id]) {
                        this.lines_by_category_id[pos_categ_id] = [line]
                    } else {
                        this.lines_by_category_id[pos_categ_id].push(line)
                    }
                }
            }
            for (let i = 0; i < promotion_lines.length; i++) {
                let promotion_line = promotion_lines[i];
                let categ_id = promotion_line['category_id'][0];
                let total_quantity = 0;

                if (this.lines_by_category_id[categ_id]) {
                    let total_quantity = 0;
                    for (let n = 0; i < this.lines_by_category_id[categ_id].length; n++) {
                        total_quantity += this.lines_by_category_id[categ_id][n]['quantity']
                    }
                    if (promotion_line['count'] <= total_quantity) {
                        condition = true;
                    }
                }
            }
            return condition && this.checking_special_client(promotion);
        },
        // TODO: 9_multi_buy
        checking_multi_buy: function (promotion) {
            let can_apply = false;
            const rules = this.pos.multi_buy_by_promotion_id[promotion.id];
            const total_qty_by_product = this.product_quantity_by_product_id();
            if (rules) {
                for (let i = 0; i < rules.length; i++) {
                    let rule = rules[i];
                    let product_ids = rule.product_ids;
                    let total_qty_exist = 0;
                    for (let index in product_ids) {
                        let product_id = product_ids[index];
                        if (total_qty_by_product[product_id]) {
                            total_qty_exist += total_qty_by_product[product_id]
                        }
                    }
                    if (total_qty_exist >= rule['qty_apply']) {
                        can_apply = true;
                        break
                    }
                }
            }
            return can_apply && this.checking_special_client(promotion);
        },
        // TODO: 10_buy_x_get_another_free
        checking_buy_x_get_another_free: function (promotion) {
            let can_apply = false;
            let minimum_items = promotion['minimum_items'];
            let total_quantity = this.product_quantity_by_product_id();
            for (let index_id in promotion.product_ids) {
                let product_id = promotion.product_ids[index_id];
                if (total_quantity[product_id] && total_quantity[product_id] >= minimum_items) {
                    let product = this.pos.db.product_by_id[product_id];
                    if (product) {
                        can_apply = true;
                        break
                    }
                }
            }
            return can_apply && this.checking_special_client(promotion);
        },
        // TODO: 11_first_order
        checking_first_order_of_customer: function (promotion) {
            let order;
            if (this.get_client()) {
                let client = this.get_client();
                order = _.filter(this.pos.db.get_pos_orders(), function (order) {
                    return order.partner_id && order.partner_id[0] == client['id']
                });
                if (order.length == 0) {
                    return true && this.checking_special_client(promotion)
                } else {
                    return false && this.checking_special_client(promotion)
                }
            } else {
                return false && this.checking_special_client(promotion)
            }
        },
        compute_discount_total_order: function (promotion) { // TODO: 1_discount_total_order
            let discount_lines = this.pos.promotion_discount_order_by_promotion_id[promotion.id];
            let total_order = this.get_amount_total_without_promotion();
            let discount_line_tmp = null;
            let discount_tmp = 0;
            if (discount_lines) {
                let i = 0;
                while (i < discount_lines.length) {
                    let discount_line = discount_lines[i];
                    if (total_order >= discount_line.minimum_amount && total_order >= discount_tmp) {
                        discount_line_tmp = discount_line;
                        discount_tmp = discount_line.minimum_amount;
                    }
                    i++;
                }
            }
            if (!discount_line_tmp) {
                return false;
            }
            if (discount_line_tmp && total_order > 0) {
                let promotion_reason = promotion.name;
                let lines = _.filter(this.orderlines.models, function (line) {
                    return !line['is_return'] && !line['promotion']
                });
                this._apply_promotion_to_orderlines(lines, promotion.id, promotion_reason, 0, discount_line_tmp.discount)
            }
        },
        //TODO: 12_buy_total_items_free_items
        checking_buy_total_items_free_items: function (promotion) {
            let total_items_ofRules_inCart = 0;
            let product_quantity_by_product_id = this.product_quantity_by_product_id();
            for (let i = 0; i < promotion.product_ids.length; i++) {
                let product_id = promotion.product_ids[i];
                let total_qty_by_product = product_quantity_by_product_id[product_id];
                if (total_qty_by_product) {
                    total_items_ofRules_inCart += total_qty_by_product
                }
            }
            if (total_items_ofRules_inCart && total_items_ofRules_inCart >= promotion.minimum_items) {
                return true && this.checking_special_client(promotion)
            } else {
                return false && this.checking_special_client(promotion)
            }
        },
        //TODO: 13_gifts_filter_by_total_amount
        checking_gifts_filter_by_total_amount: function (promotion) {
            let total_order = this.get_amount_total_without_promotion();
            if (total_order > 0 && promotion.amount_total && total_order >= promotion.amount_total) {
                return true && this.checking_special_client(promotion)
            } else {
                return false && this.checking_special_client(promotion)
            }
        },

        // TODO: 2_discount_category
        compute_discount_category: function (promotion) {
            let product = this.pos.db.get_product_by_id(promotion.product_id[0]);
            if (!product || !this.pos.promotion_by_category_id) {
                return false;
            }
            for (let i in this.pos.promotion_by_category_id) {
                let promotion_line = this.pos.promotion_by_category_id[i];
                let lines = this.orderlines.models;
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (line.promotion || line.product.pos_categ_id[0] != promotion_line.category_id[0]) {
                        continue
                    } else {
                        let promotion_reason = 'Category: ' + promotion_line.category_id[1];
                        let promotion_discount = promotion_line.discount;
                        this._apply_promotion_to_orderlines([line], promotion.id, promotion_reason, 0, promotion_discount);

                    }
                }
            }
        },
        // TODO: 3_discount_by_quantity_of_product
        compute_discount_by_quantity_of_products: function (promotion) {
            let quantity_by_product_id = this.product_quantity_by_product_id();
            let orderlines = this.orderlines.models;
            for (let product_id in quantity_by_product_id) {
                let promotion_lines = this.pos.promotion_quantity_by_product_id[product_id];
                if (!promotion_lines) {
                    continue;
                }
                let quantity_tmp = 0;
                let promotion_line = null;
                for (let index in promotion_lines) {
                    promotion_line = promotion_lines[index]
                    let condition = quantity_tmp <= promotion_line.quantity && quantity_by_product_id[product_id] >= promotion_line.quantity;
                    if (condition && promotion_line['product_id'][0] == product_id && promotion_line['promotion_id'][0] == promotion['id']) {
                        promotion_line = promotion_line;
                        quantity_tmp = promotion_line.quantity
                    }
                }
                if (promotion_line) {
                    let orderlines_promotion = _.filter(orderlines, function (orderline) {
                        return orderline.product.id == promotion_line.product_id[0];
                    });
                    if (orderlines_promotion) {
                        let promotion_reason = promotion_line.product_id[1] + ' have quantity greater or equal ' + promotion_line.quantity;
                        let promotion_discount = promotion_line.discount;
                        this._apply_promotion_to_orderlines(orderlines_promotion, promotion.id, promotion_reason, 0, promotion_discount);
                    }
                }
            }
        },
        count_quantity_by_product: function (product) {
            /*
                Function return total qty filter by product of order
            */
            let qty = 0;
            for (let i = 0; i < this.orderlines.models.length; i++) {
                let line = this.orderlines.models[i];
                if (line.product['id'] == product['id']) {
                    qty += line['quantity'];
                }
            }
            return qty;
        },
        // TODO: 4_pack_discount
        compute_pack_discount: function (promotion) {
            let discount_items = this.pos.promotion_discount_apply_by_promotion_id[promotion.id];
            if (!discount_items) {
                return;
            }
            let lines = _.filter(this.orderlines.models, function (line) {
                return !line['is_return'] && !line['promotion']
            });
            for (let n = 0; n < discount_items.length; n++) {
                let discount_item = discount_items[n];
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (line.product.id == discount_item.product_id[0]) {
                        let promotion_reason = promotion.name;
                        let promotion_discount = discount_item.discount;
                        this._apply_promotion_to_orderlines([line], promotion.id, promotion_reason, 0, promotion_discount);
                    }
                }
            }
        },
        // TODO: 5_pack_free_gift
        compute_pack_free_gift: function (promotion) {
            let gifts = this.pos.promotion_gift_free_by_promotion_id[promotion.id];
            if (!gifts) {
                console.warn('gifts not found');
                return;
            }
            let condition_items = this.pos.promotion_gift_condition_by_promotion_id[promotion.id];
            let max_qty_of_gift = null;
            let min_qty_of_condition = null;
            let current_qty = null;
            for (let i = 0; i < gifts.length; i++) {
                let gift = gifts[i];
                if (!max_qty_of_gift) {
                    max_qty_of_gift = gift.quantity_free;
                }
                if (max_qty_of_gift && max_qty_of_gift <= gift.quantity_free) {
                    max_qty_of_gift = gift.quantity_free;
                }
            }
            for (let i = 0; i < condition_items.length; i++) {
                let condition_item = condition_items[i];
                if (!min_qty_of_condition) {
                    min_qty_of_condition = condition_item.minimum_quantity;
                }
                if (min_qty_of_condition && min_qty_of_condition >= condition_item.minimum_quantity) {
                    min_qty_of_condition = condition_item.minimum_quantity
                }
                let product = this.pos.db.get_product_by_id(condition_item.product_id[0]);
                if (product) {
                    let total_qty = this.count_quantity_by_product(product);
                    if (total_qty) {
                        if (!current_qty) {
                            current_qty = total_qty
                        }
                        if (promotion.method == 'only_one') {
                            if (current_qty && total_qty >= current_qty) {
                                current_qty = total_qty
                            }
                        } else {
                            if (current_qty && total_qty <= current_qty) {
                                current_qty = total_qty
                            }
                        }

                    }
                }
            }
            if (min_qty_of_condition == 0) {
                min_qty_of_condition = 1
            }
            if (max_qty_of_gift == 0) {
                max_qty_of_gift = 1
            }
            // TODO: buy min_qty_of_condition (A) will have max_qty_of_gift (B)
            // TODO: buy current_qty (C) will have X (qty): x = C / A * B
            let temp = parseInt(current_qty / min_qty_of_condition * max_qty_of_gift);
            if (temp == 0) {
                temp = 1;
            }
            let i = 0;
            while (i < gifts.length) {
                let gift = gifts[i];
                let product = this.pos.db.get_product_by_id(gift.product_id[0]);
                if (product) {
                    let qty_free = gift.quantity_free;
                    if (gift['type'] !== 'only_one') {
                        qty_free = qty_free * temp
                    }
                    this.add_promotion_gift(product, 0, qty_free, {
                        promotion: true,
                        promotion_gift: true,
                        promotion_reason: promotion.name
                    })
                } else {
                    this.pos.alert_message({
                        title: _t('Warning'),
                        body: gift.product_id[1] + _t(' not available in POS, please contact your admin')
                    })
                }
                i++;
            }
        },
        // TODO: 6_price_filter_quantity
        compute_price_filter_quantity: function (promotion) {
            let promotion_prices = this.pos.promotion_price_by_promotion_id[promotion.id];
            if (promotion_prices) {
                let prices_item_by_product_id = {};
                for (let i = 0; i < promotion_prices.length; i++) {
                    let item = promotion_prices[i];
                    if (!prices_item_by_product_id[item.product_id[0]]) {
                        prices_item_by_product_id[item.product_id[0]] = [item]
                    } else {
                        prices_item_by_product_id[item.product_id[0]].push(item)
                    }
                }
                let quantity_by_product_id = this.product_quantity_by_product_id();
                for (i in quantity_by_product_id) {
                    if (prices_item_by_product_id[i]) {
                        let quantity_tmp = 0;
                        let price_item_tmp = null;
                        for (let j = 0; j < prices_item_by_product_id[i].length; j++) {
                            let price_item = prices_item_by_product_id[i][j];
                            if (quantity_by_product_id[i] >= price_item.minimum_quantity && quantity_by_product_id[i] >= quantity_tmp) {
                                quantity_tmp = price_item.minimum_quantity;
                                price_item_tmp = price_item;
                            }
                        }
                        if (price_item_tmp) {
                            let lines = _.filter(this.orderlines.models, function (line) {
                                return !line['is_return'] && !line['promotion'] && line.product.id == price_item_tmp.product_id[0];
                            });
                            let promotion_reason = promotion.name;
                            let promotion_amount = price_item_tmp.price_down;
                            this._apply_promotion_to_orderlines(lines, promotion.id, promotion_reason, promotion_amount, 0);
                        }
                    }
                }
            }
        },

        // TODO: 7_special_category
        compute_special_category: function (promotion) {
            let promotion_lines = this.pos.promotion_special_category_by_promotion_id[promotion['id']];
            this.lines_by_category_id = {};
            for (let i = 0; i < this.orderlines.models.length; i++) {
                let line = this.orderlines.models[i];
                if (line.promotion) {
                    continue;
                }
                let pos_categ_id = line['product']['pos_categ_id'][0]
                if (pos_categ_id) {
                    if (!this.lines_by_category_id[pos_categ_id]) {
                        this.lines_by_category_id[pos_categ_id] = [line]
                    } else {
                        this.lines_by_category_id[pos_categ_id].push(line)
                    }
                }
            }
            let promotion_line_active = null
            for (let i = 0; i < promotion_lines.length; i++) {
                let promotion_line = promotion_lines[i];
                let categ_id = promotion_line['category_id'][0];
                if (this.lines_by_category_id[categ_id]) {
                    let total_quantity = 0;
                    for (let n = 0; n < this.lines_by_category_id[categ_id].length; n++) {
                        total_quantity += this.lines_by_category_id[categ_id][n]['quantity']
                    }
                    if (promotion_line['count'] <= total_quantity && (!promotion_line_active || (promotion_line_active && promotion_line['count'] > promotion_line_active['count']))) {
                        promotion_line_active = promotion_line
                    }
                }
            }
            if (promotion_line_active) {
                let promotion_type = promotion_line_active['type'];
                if (promotion_type == 'discount') {
                    let discount = 0;
                    let quantity = 0;
                    let lines = this.lines_by_category_id[categ_id];
                    for (let j = 0; j < lines.length; j++) {
                        quantity += lines[j]['quantity'];
                        let line = lines[j];
                        if (quantity >= promotion_line_active['count']) {
                            if (this.pos.config.iface_tax_included === 'total') {
                                discount += line.get_price_with_tax() / 100 / line['quantity'] * promotion_line_active['discount']
                            } else {
                                discount += line.get_price_without_tax() / 100 / line['quantity'] * promotion_line_active['discount']
                            }
                        }
                    }
                    if (discount != 0) {
                        this._apply_promotion_to_orderlines(lines, promotion.id, promotion.name, 0, discount);
                    }
                }
                if (promotion_type == 'free') {
                    let product_free = this.pos.db.product_by_id[promotion_line_active['product_id'][0]];
                    if (product_free) {
                        this.add_promotion_gift(product_free, 0, promotion_line_active['qty_free'], {
                            promotion: true,
                            promotion_id: promotion.id,
                            promotion_special_category: true,
                            promotion_reason: 'Applied ' + promotion['name'] + ', Buy bigger than or equal ' + promotion_line_active['count'] + ' product of ' + promotion_line_active['category_id'][1] + ' free ' + promotion_line_active['qty_free'] + ' ' + product_free['display_name']
                        })
                    }
                }
            }
        },
        // TODO: 8_discount_lowest_price
        compute_discount_lowest_price: function (promotion) {
            let orderlines = this.orderlines.models;
            let line_apply = null;
            for (let i = 0; i < orderlines.length; i++) {
                let line = orderlines[i];
                if (!line_apply) {
                    line_apply = line
                } else {
                    if (line.get_price_with_tax() < line_apply.get_price_with_tax()) {
                        line_apply = line;
                    }
                }
            }
            let product_discount = this.pos.db.product_by_id[promotion.product_id[0]];
            if (line_apply && product_discount) {
                let promotion_reason = promotion.name;
                let promotion_discount = promotion.discount_lowest_price;
                this._apply_promotion_to_orderlines([line_apply], promotion.id, promotion_reason, 0, promotion_discount);
            }
        },
        _get_rules_apply_multi_buy: function (promotion) {
            let rules_apply = [];
            let rules = this.pos.multi_buy_by_promotion_id[promotion.id];
            let total_qty_by_product = this.product_quantity_by_product_id();
            if (rules) {
                for (let i = 0; i < rules.length; i++) {
                    let rule = rules[i];
                    let product_ids = rule.product_ids;
                    let total_qty_exist = 0;
                    for (let index in product_ids) {
                        let product_id = product_ids[index];
                        if (total_qty_by_product[product_id]) {
                            total_qty_exist += total_qty_by_product[product_id]
                        }
                    }
                    if (total_qty_exist >= rule['qty_apply']) {
                        rules_apply.push(rule)
                    }
                }
            }
            return rules_apply
        },

        // TODO: 9_multi_buy
        compute_multi_buy: function (promotion) {
            let rules_apply = this._get_rules_apply_multi_buy(promotion)
            let total_qty_by_product = this.product_quantity_by_product_id()
            let product_discount = this.pos.db.product_by_id[promotion.product_id[0]]
            let product_promotion = {};
            if (rules_apply && product_discount) {
                for (let n = 0; n < rules_apply.length; n++) {
                    let rule = rules_apply[n];
                    let qty_remain = rule['qty_apply'];
                    for (let index in rule.product_ids) {
                        let product_id = rule.product_ids[index];
                        if (total_qty_by_product[product_id]) {
                            let qty_of_product_in_cart = total_qty_by_product[product_id];
                            if (qty_remain >= qty_of_product_in_cart) {
                                product_promotion[product_id] = qty_of_product_in_cart;
                                qty_remain -= qty_of_product_in_cart
                            } else if (qty_remain < qty_of_product_in_cart) {
                                if (qty_remain == 0) {
                                    break
                                }
                                if ((qty_remain - qty_of_product_in_cart) <= 0) {
                                    product_promotion[product_id] = qty_remain
                                    break
                                } else {
                                    product_promotion[product_id] = qty_of_product_in_cart
                                }
                            }
                        }
                    }
                    let promotion_amount = 0;
                    let promotion_reason = _t('Buy ');
                    for (let product_id in product_promotion) {
                        let product = this.pos.db.get_product_by_id(product_id);
                        let differencePrice = product.get_price(this.pos._get_active_pricelist(), 1, product.uom_id[0]) - rule.list_price
                        promotion_amount += differencePrice * total_qty_by_product[product_id];
                        promotion_reason += product_promotion[product_id] + ' ' + product.display_name;
                        promotion_reason += ' , '
                    }
                    promotion_reason += ' Set price each item ' + this.pos.format_currency(rule.list_price);
                    product_discount.display_name = promotion_reason
                    this.add_promotion_gift(product_discount, promotion_amount, -1, {
                        promotion: true,
                        promotion_reason: promotion_reason
                    })
                }
            }
        },

        // TODO: 10_buy_x_get_another_free
        compute_buy_x_get_another_free: function (promotion) {
            let minimum_items = promotion['minimum_items'];
            let total_quantity = this.product_quantity_by_product_id();
            for (let index_id in promotion.product_ids) {
                let product_id = promotion.product_ids[index_id];
                if (total_quantity[product_id] && total_quantity[product_id] >= minimum_items) {
                    let qty_free = round_pr((total_quantity[product_id] / minimum_items), 0);
                    let product = this.pos.db.product_by_id[product_id];
                    if (!product) {
                        return this.pos.alert_message({
                            title: _t('Error'),
                            body: 'Product id ' + product_id + ' not available in pos'
                        })
                    }
                    this.add_promotion_gift(product, 0, -qty_free, {
                        promotion: true,
                        promotion_reason: promotion.name
                    })
                }
            }
        },

        // TODO: 11_first_order
        compute_first_order: function (promotion) {
            let total_order = this.get_amount_total_without_promotion();
            if (total_order > 0 && promotion['discount_first_order']) {
                let promotion_reason = promotion.name;
                let lines = _.filter(this.orderlines.models, function (line) {
                    return !line['is_return'] && !line['promotion']
                });
                this._apply_promotion_to_orderlines(lines, promotion.id, promotion_reason, 0, promotion.discount_first_order)
            }
        },

        // TODO: 12_buy_total_items_free_items
        compute_buy_total_items_free_items: function (promotion) {
            let gifts = this.pos.promotion_gift_free_by_promotion_id[promotion.id];
            if (!gifts) {
                console.warn('gifts not found');
                return false;
            }
            let total_items_ofRules_inCart = 0;
            let product_quantity_by_product_id = this.product_quantity_by_product_id();
            for (let i = 0; i < promotion.product_ids.length; i++) {
                let product_id = promotion.product_ids[i];
                let total_qty_by_product = product_quantity_by_product_id[product_id];
                if (total_qty_by_product) {
                    total_items_ofRules_inCart += total_qty_by_product
                }
            }
            let minimum_items = promotion.minimum_items;
            for (let i = 0; i < gifts.length; i++) {
                let gift = gifts[i];
                let product = this.pos.db.get_product_by_id(gift.product_id[0]);
                let qty_free = gift.quantity_free;
                if (!product) {
                    Gui.showPopup('ConfirmPopup', {
                        title: _t('Warning'),
                        body: gift.product_id[1] + _t(' not available in POS, please contact your admin'),
                        disableCancelButton: true,
                    })
                } else {
                    if (gift.type == 'only_one') {
                        qty_free = qty_free
                    } else {
                        qty_free = parseInt(this.get_total_items() / minimum_items) * qty_free
                    }
                    let product = this.pos.db.get_product_by_id(gift.product_id[0]);
                    if (product) {
                        this.add_promotion_gift(product, 0, qty_free, {
                            promotion: true,
                            promotion_gift: true,
                            promotion_reason: promotion.name
                        })
                    } else {
                        Gui.showPopup('ConfirmPopup', {
                            title: _t('Alert'),
                            body: _t('Product' + gift.product_id[1] + ' not found on YOUR POS'),
                            disableCancelButton: true,
                        })
                    }
                }
            }
        },

        // TODO: 12_buy_total_items_free_items
        compute_gifts_filter_by_total_amount: function (promotion) {
            let gifts = this.pos.promotion_gift_free_by_promotion_id[promotion.id];
            if (!gifts) {
                console.warn('gifts not found');
                return false;
            }
            let total_order = this.get_amount_total_without_promotion();
            for (let i = 0; i < gifts.length; i++) {
                let gift = gifts[i];
                let qty_free = gift.quantity_free;
                if (gift.type != 'only_one') {
                    if (promotion.amount_total == 0) {
                        promotion.amount_total = 1
                    }
                    qty_free = parseInt(total_order / promotion.amount_total * qty_free)
                }
                let product = this.pos.db.get_product_by_id(gift.product_id[0]);
                if (product) {
                    this.add_promotion_gift(product, 0, qty_free, {
                        promotion: true,
                        promotion_gift: true,
                        promotion_reason: promotion.name
                    })
                } else {
                    Gui.showPopup('ConfirmPopup', {
                        title: _t('Alert'),
                        body: _t('Product' + gift.product_id[1] + ' not found in POS'),
                        disableCancelButton: true,
                    })
                }
            }
        },
        _apply_promotion_to_orderlines: function (lines, promotion_id, promotion_reason, promotion_amount, promotion_discount) {
            for (let n = 0; n < lines.length; n++) {
                let line = lines[n];
                line.promotion = true;
                line.promotion_id = promotion_id;
                line.promotion_reason = promotion_reason;
                if (promotion_amount > 0) {
                    line.promotion_amount = promotion_amount;
                }
                if (promotion_discount > 0) {
                    line.promotion_discount = promotion_discount;
                }
                line.trigger('change', line)
            }
            this.pos.trigger('auto_update:paymentlines');
        },
        add_promotion_gift: function (product, price, quantity, options) {
            let line = new models.Orderline({}, {pos: this.pos, order: this.pos.get_order(), product: product});
            line.promotion = true;
            line.promotion_gift = true;
            if (options.buyer_promotion) {
                line.promotion = options.buyer_promotion;
            }
            if (options.frequent_buyer_id) {
                line.frequent_buyer_id = options.frequent_buyer_id;
            }
            if (options.promotion_reason) {
                line.promotion_reason = options.promotion_reason;
            }
            if (options.promotion_price_by_quantity) {
                line.promotion_price_by_quantity = options.promotion_price_by_quantity;
            }
            line.price_manually_set = true; //no need pricelist change, price of promotion change the same, i blocked
            line.set_quantity(quantity);
            line.set_unit_price(price);
            line.price_manually_set = true;
            this.orderlines.add(line);
            this.pos.trigger('auto_update:paymentlines');
        },
        _checking_period_times_condition: function (promotion) {
            let days = {
                1: 'monday',
                2: 'tuesday',
                3: 'wednesday',
                4: 'thursday',
                5: 'friday',
                6: 'saturday',
                7: 'sunday',
            };
            let pass_condition = false;
            if (!promotion.special_days && !promotion.special_times) {
                pass_condition = true
            } else {
                let date_now = new Date();
                let day_now = date_now.getDay();
                if (promotion.special_days) {
                    if (promotion[days[day_now]] == true) {
                        pass_condition = true
                    } else {
                        return pass_condition
                    }
                }
                if (promotion.special_times) {
                    let limit_from_time = promotion.from_time;
                    let limit_to_time = promotion.to_time;
                    let current_time = date_now.getHours() + date_now.getMinutes() / 600;
                    if (current_time >= limit_from_time && current_time <= limit_to_time) {
                        pass_condition = true
                    } else {
                        pass_condition = false
                    }
                }
            }
            return pass_condition;
        }
    });

    let _super_Orderline = models.Orderline.prototype;
    models.Orderline = models.Orderline.extend({
        initialize: function (attributes, options) {
            let res = _super_Orderline.initialize.apply(this, arguments);
            if (!options.json) {
                // TODO: if sync between session active auto set seller is user assigned
                if (this.pos.config.sync_multi_session && this.pos.config.user_id) {
                    let seller = this.pos.user_by_id[this.pos.config.user_id[0]];
                    if (seller) {
                        this.set_sale_person(seller)
                    }
                }
                // TODO: if default seller auto set user_id for pos_order_line
                if (this.pos.default_seller) {
                    this.set_sale_person(this.pos.default_seller)
                }
                this.selected_combo_items = {};
                this.plus_point = 0;
                this.redeem_point = 0;
                this.reward_id = null;
                this.order_time = new Date().toLocaleTimeString()
                this.addon_ids = []
            }
            return res;
        },

        init_from_JSON: function (json) {
            this.restoring = true
            _super_Orderline.init_from_JSON.apply(this, arguments);
            this.restoring = false
            if (json.promotion) {
                this.promotion = json.promotion;
            }
            if (json.promotion_gift) {
                this.promotion_gift = json.promotion_gift;
            }
            if (json.promotion_id) {
                this.promotion_id = json.promotion_id;
            }
            if (json.promotion_discount) {
                this.promotion_discount = json.promotion_discount;
            }
            if (json.promotion_amount) {
                this.promotion_amount = json.promotion_amount;
            }
            if (json.promotion_reason) {
                this.promotion_reason = json.promotion_reason;
            }
            if (json.plus_point) {
                this.plus_point = json.plus_point;
            }
            if (json.redeem_point) {
                this.redeem_point = json.redeem_point;
            }
            if (json.reward_id) {
                this.reward_id = json.reward_id;
            }
            if (json.price_extra) {
                this.price_extra = json.price_extra;
            }
            if (json.discount_extra) {
                this.discount_extra = json.discount_extra
            }
            if (json.user_id) {
                let seller = this.pos.user_by_id[json.user_id];
                if (seller) {
                    this.set_sale_person(seller)
                }
            }
            if (json.tag_ids && json.tag_ids.length) {
                let tag_ids = json.tag_ids[0][2];
                if (tag_ids) {
                    this.set_tags(tag_ids)
                }
            }
            if (json.is_return) {
                this.is_return = json.is_return;
            }
            if (json.combo_item_ids && json.combo_item_ids.length) {
                this.set_combo_bundle_pack(json.combo_item_ids);
            }
            if (json.variant_ids && json.variant_ids.length) {
                let variant_ids = json.variant_ids[0][2];
                if (variant_ids) {
                    this.set_variants(variant_ids)
                }
            }
            if (json.uom_id) {
                this.uom_id = json.uom_id;
                let unit = this.pos.units_by_id[json.uom_id];
                if (unit) {
                    this.product.uom_id = [unit['id'], unit['name']];
                }
                this.set_unit(this.uom_id)
            }
            if (json.note) {
                this.note = json.note;
            }
            if (json.discount_reason) {
                this.discount_reason = json.discount_reason
            }
            if (json.frequent_buyer_id) {
                this.frequent_buyer_id = json.frequent_buyer_id;
            }
            if (json.packaging_id && this.pos.packaging_by_id && this.pos.packaging_by_id[json.packaging_id]) {
                this.packaging = this.pos.packaging_by_id[json.packaging_id];
            }
            if (json.lot_ids) {
                this.lot_ids = json.lot_ids;
            }
            if (json.manager_user_id && this.pos.user_by_id && this.pos.user_by_id[json.manager_user_id]) {
                this.manager_user = this.pos.user_by_id[json.manager_user_id]
            }
            if (json.base_price) {
                this.set_unit_price(json.base_price);
                this.base_price = null;
            }
            if (json.selected_combo_items) {
                this.set_dynamic_combo_items(json.selected_combo_items)
            }
            if (json.returned_order_line_id) {
                this.returned_order_line_id = json.returned_order_line_id
            }
            if (json.generic_option_ids && json.generic_option_ids.length) {
                let generic_option_ids = json.generic_option_ids[0][2];
                if (generic_option_ids) {
                    this.set_generic_options(generic_option_ids)
                }
            }
            if (json.bom_lines) {
                this.set_bom_lines(json.bom_lines)
            }
            if (json.mrp_production_id) {
                this.mrp_production_id = json.mrp_production_id
            }
            if (json.mrp_production_name) {
                this.mrp_production_name = json.mrp_production_name
            }
            if (json.mrp_production_state) {
                this.mrp_production_state = json.mrp_production_state
            }
            if (json.is_shipping_cost) {
                this.is_shipping_cost = json.is_shipping_cost
            }
            if (json.order_time) {
                this.order_time = json.order_time
            }
            if (json.coupon_program_id) {
                this.coupon_program_id = json.coupon_program_id
            }
            if (json.coupon_id) {
                this.coupon_id = json.coupon_id
            }
            if (json.coupon_ids) {
                this.coupon_ids = json.coupon_ids
            }
            if (json.coupon_program_name) {
                this.coupon_program_name = json.coupon_program_name
            }
            if (json.coupon_code) {
                this.coupon_code = json.coupon_code
            }
            if (json.addon_ids) {
                this.set_addons(json.addon_ids)
            }
            if (json.combo_items) {
                this.combo_items = json.combo_items
            }
            if (json.modifiers) {
                this.modifiers = json.modifiers
            }
        },

        export_as_JSON: function () {
            let json = _super_Orderline.export_as_JSON.apply(this, arguments);
            if (this.promotion) {
                json.promotion = this.promotion;
            }
            if (this.promotion_gift) {
                json.promotion_gift = this.promotion_gift;
            }
            if (this.promotion_id) {
                json.promotion_id = this.promotion_id;
            }
            if (this.promotion_reason) {
                json.promotion_reason = this.promotion_reason;
            }
            if (this.promotion_discount) {
                json.promotion_discount = this.promotion_discount;
            }
            if (this.promotion_amount) {
                json.promotion_amount = this.promotion_amount;
            }
            if (this.plus_point) {
                json.plus_point = this.plus_point;
            }
            if (this.redeem_point) {
                json.redeem_point = this.redeem_point;
            }
            if (this.reward_id) {
                json.reward_id = json.reward_id;
            }
            if (this.price_extra) {
                json.price_extra = this.price_extra;
            }
            if (this.discount_extra) {
                json.discount_extra = this.discount_extra;
            }
            if (this.seller) {
                json.user_id = this.seller.id;
            }
            if (this.base_price) {
                json.base_price = this.base_price;
            }
            if (this.tags && this.tags.length) {
                json.tag_ids = [[6, false, _.map(this.tags, function (tag) {
                    return tag.id;
                })]];
            }
            if (this.get_line_note()) {
                json.note = this.get_line_note();
            }
            if (this.is_return) {
                json.is_return = this.is_return;
            }
            if (this.combo_items && this.combo_items.length) {
                json.combo_item_ids = [];
                for (let n = 0; n < this.combo_items.length; n++) {
                    json.combo_item_ids.push({
                        id: this.combo_items[n].id,
                        quantity: this.combo_items[n].quantity
                    })
                }
            }
            if (this.uom_id) {
                json.uom_id = this.uom_id
            }
            if (this.variants && this.variants.length) {
                json.variant_ids = [[6, false, _.map(this.variants, function (variant) {
                    return variant.id;
                })]];
            }
            if (this.discount_reason) {
                json.discount_reason = this.discount_reason
            }
            if (this.frequent_buyer_id) {
                json.frequent_buyer_id = this.frequent_buyer_id
            }
            if (this.packaging) {
                json.packaging_id = this.packaging.id
            }
            if (this.lot_ids) {
                let pack_lot_ids = json.pack_lot_ids;
                for (let i = 0; i < this.lot_ids.length; i++) {
                    let lot = this.lot_ids[i];
                    pack_lot_ids.push([0, 0, {
                        lot_name: lot['name'],
                        quantity: lot['quantity'],
                        lot_id: lot['id']
                    }]);
                }
                json.pack_lot_ids = pack_lot_ids;
            }
            if (this.manager_user) {
                json.manager_user_id = this.manager_user.id
            }
            if (this.selected_combo_items) {
                json.selected_combo_items = this.selected_combo_items;
            }
            if (this.returned_order_line_id) {
                json.returned_order_line_id = this.returned_order_line_id;
            }
            if (this.generic_options && this.generic_options.length) {
                json.generic_option_ids = [[6, false, _.map(this.generic_options, function (generic) {
                    return generic.id;
                })]];
            }
            if (this.bom_lines) {
                json.bom_lines = this.bom_lines
            }
            if (this.mrp_production_id) {
                json.mrp_production_id = this.mrp_production_id
            }
            if (this.mrp_production_state) {
                json.mrp_production_state = this.mrp_production_state
            }
            if (this.mrp_production_name) {
                json.mrp_production_name = this.mrp_production_name
            }
            if (this.is_shipping_cost) {
                json.is_shipping_cost = this.is_shipping_cost
            }
            if (this.order_time) {
                json.order_time = this.order_time
            }
            if (this.coupon_program_id) {
                json.coupon_program_id = this.coupon_program_id
            }
            if (this.coupon_id) {
                json.coupon_id = this.coupon_id
            }
            if (this.coupon_ids) {
                json.coupon_ids = this.coupon_ids
            }
            if (this.coupon_program_name) {
                json.coupon_program_name = this.coupon_program_name
            }
            if (this.coupon_code) {
                json.coupon_code = this.coupon_code
            }
            if (this.addon_ids) {
                json.addon_ids = this.addon_ids
            }
            if (this.combo_items) {
                json.combo_items = this.combo_items
            }
            if (this.modifiers) {
                json.modifiers = this.modifiers
            }
            return json;
        },

        clone: function () {
            let orderline = _super_Orderline.clone.call(this);
            orderline.note = this.note;
            orderline.discount_reason = this.discount_reason;
            orderline.uom_id = this.uom_id;
            if (this.combo_item_ids && this.combo_item_ids.length) {
                orderline.set_combo_bundle_pack(this.combo_item_ids);
            }
            if (this.variant_ids && this.variant_ids.length) {
                let variant_ids = this.variant_ids[0][2];
                if (variant_ids) {
                    orderline.set_variants(variant_ids)
                }
            }
            orderline.mp_dirty = this.mp_dirty;
            orderline.mp_skip = this.mp_skip;
            orderline.discountStr = this.discountStr;
            orderline.price_extra = this.price_extra;
            orderline.discount_extra = this.discount_extra;
            orderline.discount_reason = this.discount_reason;
            orderline.plus_point = this.plus_point;
            orderline.redeem_point = this.redeem_point;
            orderline.user_id = this.user_id;
            return orderline;
        },

        export_for_printing: function () {
            let receipt_line = _super_Orderline.export_for_printing.apply(this, arguments);
            receipt_line['promotion'] = null;
            receipt_line['promotion_reason'] = null;
            if (this.promotion) {
                receipt_line.promotion = this.promotion;
                receipt_line.promotion_reason = this.promotion_reason;
            }
            if (this.coupon_program_name) {
                receipt_line.coupon_program_name = this.coupon_program_name
            }
            receipt_line['combo_items'] = [];
            receipt_line['variants'] = [];
            receipt_line['tags'] = [];
            receipt_line['addons'] = [];
            receipt_line['note'] = this.note || '';
            receipt_line['combo_items'] = [];
            if (this.modifiers) {
                receipt_line['modifiers'] = this.modifiers;
            }
            if (this.combo_items) {
                receipt_line['combo_items'] = this.combo_items;
            }
            if (this.variants) {
                receipt_line['variants'] = this.variants;
            }
            if (this.tags) {
                receipt_line['tags'] = this.tags;
            }
            if (this.discount_reason) {
                receipt_line['discount_reason'] = this.discount_reason;
            }
            receipt_line['tax_amount'] = this.get_tax() || 0.00;
            if (this.variants) {
                receipt_line['variants'] = this.variants;
            }
            if (this.packaging) {
                receipt_line['packaging'] = this.packaging;
            }
            if (this.product.name_second) {
                receipt_line['name_second'] = this.product.name_second
            }
            if (this.selected_combo_items) {
                receipt_line['selected_combo_items'] = this.selected_combo_items;
            }
            if (this.generic_options) {
                receipt_line['generic_options'] = this.generic_options;
            }
            if (this.bom_lines) {
                receipt_line['bom_lines'] = this.get_bom_lines()
            }
            if (this.mrp_production_id) {
                receipt_line['mrp_production_id'] = this.mrp_production_id;
            }
            if (this.mrp_production_state) {
                receipt_line['mrp_production_state'] = this.mrp_production_state;
            }
            if (this.mrp_production_name) {
                receipt_line['mrp_production_name'] = this.mrp_production_name;
            }
            if (this.addon_ids) {
                for (let index in this.addon_ids.length) {
                    let product = this.pos.db.get_product_by_id(this.addon_ids[index]);
                    if (product) {
                        receipt_line['addons'].push(product)
                    }
                }
            }
            return receipt_line;
        },

        set_price_by_pricelist() {
            this.price_by_pricelist = {}
            const pricelists = this.pos.pricelists
            for (let i = 0; i < pricelists.length; i++) {
                let pricelist = pricelists[i]
                this.price_by_pricelist[pricelist.id] = this.product.get_price(pricelist, this.quantity, 0, this.uom_id || this.product.uom_id[0])
            }
        },

        get_lot_lines: function () {
            return this.pack_lot_lines.models;
        },

        get_display_price: function () {
            const price = _super_Orderline.get_display_price.apply(this, arguments);
            if (this.pos.config.display_sale_price_within_tax) {
                return this.get_price_with_tax();
            } else {
                return price
            }
        },

        getPackLotLinesToEdit: function (isAllowOnlyOneLot) {
            let lotAdded = _super_Orderline.getPackLotLinesToEdit.apply(this, arguments);
            return lotAdded
        },

        _get_plus_point: function () {
            if (!this.pos.retail_loyalty) {
                return 0
            }
            if (this.pos.retail_loyalty.rounding_down) {
                return parseInt(this.plus_point)
            } else {
                return round_pr(this.plus_point, this.pos.retail_loyalty.rounding)
            }
        },

        set_addons(addon_ids) {
            this.addons = []
            this.addon_ids = []
            let price_extra = 0;
            for (let index in addon_ids) {
                let product = this.pos.db.get_product_by_id(addon_ids[index]);
                if (product) {
                    this.addons.push(product)
                    this.addon_ids.push(product.id)
                    let price = product.get_price(this.pos._get_active_pricelist(), this.quantity);
                    price_extra += price
                }
            }
            if (this.product.addon_id && this.pos.addon_by_id[this.product.addon_id[0]] && this.pos.addon_by_id[this.product.addon_id[0]]['include_price_to_product']) {
                this.price_extra = price_extra
            }
            this.trigger('change', this)
        },

        set_price_extra: function (price_extra) {
            _super_Orderline.set_price_extra.apply(this, arguments);
        },

        set_unit_price: function (price) {
            if (this.pos.the_first_load == false && this.product.refundable == false && parseFloat(price) < 0) {
                return this.pos.alert_message({
                    title: _t('Error'),
                    body: this.product.display_name + _t(' Refundable is Unactive, not possible Discount it')
                });
            }
            _super_Orderline.set_unit_price.apply(this, arguments);
            if (this.coupon_ids && !this.pos.the_first_load) {
                this.pos.rpc({
                    model: 'coupon.generate.wizard',
                    method: 'remove_giftcards',
                    args: [[], this.coupon_ids],
                })
                this.coupon_ids = null;
                this.pos.alert_message({
                    title: this.pos.env._t('Alert'),
                    body: this.pos.env._t('Gift cards created before just removed')
                })
            }
        },
        display_discount_policy: function () {
            if (this.order.pricelist) {
                return _super_Orderline.display_discount_policy.apply(this, arguments);
            } else {
                return null
            }
        },
        get_margin: function () {
            if (this.product.standard_price <= 0) {
                return 100
            } else {
                return (this.price - this.product.standard_price) / this.product.standard_price * 100
            }
        },
        set_multi_lot: function (lot_ids) {
            let lot_selected = [];
            for (let i = 0; i < lot_ids.length; i++) {
                let lot = lot_ids[i];
                let lot_record = this.pos.lot_by_id[lot['id']];
                if (lot_record && lot['quantity'] && lot['quantity'] > 0) {
                    lot['name'] = lot_record['name'];
                    lot_selected.push(lot)
                } else {
                    return Gui.showPopup('ConfirmPopup', {
                        title: _t('Warning'),
                        body: _t('Lot ' + lot_record.id + ' does not exist. Backend system have removed it, it not possible made return with Lots'),
                        disableCancelButton: true,
                    })
                }
            }
            this.lot_ids = lot_selected;
            this.trigger('change', this);
            this.trigger('trigger_update_line');
        },
        set_line_note: function (note) {
            this.note = note;
            this.trigger('change', this);
        },
        get_line_note: function () {
            return this.note
        },
        // TODO: this is combo bundle pack
        set_combo_bundle_pack: function (combo_item_ids) {
            // TODO: combo_item_ids is dict value have id is id of combo item, and quantity if quantity of combo item
            let price_extra = 0;
            this.combo_items = [];
            for (let n = 0; n < combo_item_ids.length; n++) {
                let combo_item_id = combo_item_ids[n].id;
                let quantity = combo_item_ids[n].quantity;
                let combo_item = this.pos.combo_item_by_id[combo_item_id];
                if (combo_item) {
                    this.combo_items.push({
                        id: combo_item['id'],
                        quantity: quantity,
                        price_extra: combo_item.price_extra,
                        product_id: combo_item.product_id,
                    });
                    price_extra += combo_item.price_extra * quantity;
                }
            }
            if (price_extra) {
                this.price_extra = price_extra;
            }
            this.trigger('change', this);
        },
        set_tags: function (tag_ids) {
            this.tags = [];
            for (let index in tag_ids) {
                let tag_id = tag_ids[index];
                let tag = this.pos.tag_by_id[tag_id];
                if (tag) {
                    this.tags.push(tag)
                }
            }
            if (this.tags.length) {
                this.trigger('change', this);
            }
        },
        get_price_included_tax_by_price_of_item: function (price_unit, quantity) {
            let taxtotal = 0;
            let product = this.get_product();
            let taxes_ids = product.taxes_id;
            let taxes = this.pos.taxes;
            let taxdetail = {};
            let product_taxes = [];

            _(taxes_ids).each(function (el) {
                product_taxes.push(_.detect(taxes, function (t) {
                    return t.id === el;
                }));
            });

            let all_taxes = this.compute_all(product_taxes, price_unit, quantity, this.pos.currency.rounding);
            _(all_taxes.taxes).each(function (tax) {
                taxtotal += tax.amount;
                taxdetail[tax.id] = tax.amount;
            });

            return {
                "priceWithTax": all_taxes.total_included,
                "priceWithoutTax": all_taxes.total_excluded,
                "tax": taxtotal,
                "taxDetails": taxdetail,
            };
        },
        set_unit_price_with_currency: function (price, currency) {
            if (currency.id != this.pos.currency.id) {
                if (!this.base_price) {
                    this.base_price = this.price;
                    this.price = price * 1 / currency.rate;
                } else {
                    this.price = this.base_price * 1 / currency.rate;
                }
            } else {
                if (this.base_price) {
                    this.price = this.base_price;
                }
            }
            this.currency = currency;
            this.trigger('change', this);

        },
        has_dynamic_combo_active: function () {
            let pos_categories_combo = _.filter(this.pos.pos_categories, function (categ) {
                return categ.is_category_combo
            });
            if (pos_categories_combo.length > 0) {
                return true
            } else {
                return false
            }
        },
        has_bundle_pack: function () {
            if (this.combo_items && this.combo_items.length) {
                return true
            } else {
                return false
            }
        },
        has_valid_product_lot: function () { //  TODO: is line multi lots or not
            if (this.lot_ids && this.lot_ids.length) {
                return true
            } else {
                return _super_Orderline.has_valid_product_lot.apply(this, arguments);
            }
        },
        has_input_return_reason: function () {
            if (this.tags && this.tags.length) {
                let reason = _.find(this.tags, function (reason) {
                    return reason.is_return_reason;
                });
                if (reason) {
                    return true
                } else {
                    return false
                }
            } else {
                return false
            }
        },
        has_multi_unit: function () {
            let product = this.product;
            let product_tmpl_id;
            if (product.product_tmpl_id instanceof Array) {
                product_tmpl_id = product.product_tmpl_id[0]
            } else {
                product_tmpl_id = product.product_tmpl_id;
            }
            let uom_items = this.pos.uoms_prices_by_product_tmpl_id[product_tmpl_id];
            if (!uom_items) {
                return false;
            }
            let base_uom_id = product['base_uom_id'];
            if (base_uom_id) {
                let base_uom = this.pos.uom_by_id[base_uom_id[0]];
                base_uom['price'] = product.lst_price;
                base_uom['uom_id'] = [base_uom['id'], base_uom['name']];
                uom_items = uom_items.concat(base_uom)
            }
            if (uom_items.length > 0) {
                return true
            }
        },
        set_generic_options: function (generic_option_ids) {
            if (!this.pos.generic_options) {
                return;
            }
            if (generic_option_ids.length) {
                this.generic_options = [];
                this.price_extra = 0
                for (let i = 0; i < generic_option_ids.length; i++) {
                    let generic = this.pos.generic_option_by_id[generic_option_ids[i]];
                    if (generic) {
                        this.generic_options.push(generic)
                        if (generic.price_extra >= 0) {
                            this.price_extra += generic.price_extra
                        }
                    }
                }
                this.generic_option_ids = generic_option_ids;
                this.trigger('change', this)
            } else {
                this.generic_option_ids = []
            }
        },
        set_taxes: function (tax_ids) { // TODO: add taxes to order line
            if (this.product) {
                this.product.taxes_id = tax_ids;
                this.trigger('change', this);
            }
        },
        get_unit_price: function () {
            let unit_price = _super_Orderline.get_unit_price.apply(this, arguments);
            if (this.price_extra) {
                unit_price += this.price_extra;
            }
            if (this.discount_extra && this.discount_extra > 0 && this.discount_extra <= 100) {
                unit_price = unit_price - (unit_price * this.discount_extra / 100)
            }
            if (this.promotion_id) {
                if (this.promotion_amount > 0) {
                    unit_price = unit_price - this.promotion_amount
                }
                if (this.promotion_discount > 0) {
                    unit_price = unit_price - (unit_price * this.promotion_discount / 100)
                }
            }
            return unit_price;
        },
        set_variants: function (variant_ids) { // TODO: add variants to order line
            let self = this;
            let price_extra = 0;
            this.variants = variant_ids.map((variant_id) => (self.pos.variant_by_id[variant_id]))
            for (let i = 0; i < this.variants.length; i++) {
                let variant = this.variants[i];
                price_extra += variant.price_extra * variant.quantity;
            }
            if (this.price_extra != price_extra) {
                this.price_extra = price_extra;
                this.trigger('change', this);
            }
        },
        get_product_price_quantity_item: function () {
            let product_tmpl_id = this.product.product_tmpl_id;
            if (product_tmpl_id instanceof Array) {
                product_tmpl_id = product_tmpl_id[0]
            }
            let product_price_quantities = this.pos.price_each_qty_by_product_tmpl_id[product_tmpl_id];
            if (product_price_quantities) {
                let product_price_quanty_temp = null;
                for (let i = 0; i < product_price_quantities.length; i++) {
                    let product_price_quantity = product_price_quantities[i];
                    if (this.quantity >= product_price_quantity['quantity']) {
                        if (!product_price_quanty_temp) {
                            product_price_quanty_temp = product_price_quantity;
                        } else {
                            if (product_price_quanty_temp['quantity'] <= product_price_quantity['quantity']) {
                                product_price_quanty_temp = product_price_quantity;
                            }
                        }
                    }
                }
                return product_price_quanty_temp;
            }
            return null
        },
        has_variants: function () {
            if (this.variants && this.variants.length && this.variants.length > 0) {
                return true
            } else {
                return false
            }
        },
        set_product_lot: function (product) {
            if (product) { // first install may be have old orders, this is reason made bug
                return _super_Orderline.set_product_lot.apply(this, arguments);
            } else {
                return null
            }
        },
        // if config product tax id: have difference tax of other company
        // but when load data account.tax, pos default only get data of current company
        // and this function return some item undefined
        get_taxes: function () {
            const taxes = _super_Orderline.export_for_printing.apply(this, arguments);
            let new_taxes = [];
            let taxes_ids = this.get_product().taxes_id;
            for (let i = 0; i < taxes_ids.length; i++) {
                if (this.pos.taxes_by_id[taxes_ids[i]]) {
                    new_taxes.push(this.pos.taxes_by_id[taxes_ids[i]]);
                }
            }
            return new_taxes;
        },
        get_packaging: function () {
            if (!this || !this.product || !this.pos.packaging_by_product_id) {
                return false;
            }
            if (this.pos.packaging_by_product_id[this.product.id]) {
                return true
            } else {
                return false
            }
        },
        get_packaging_added: function () {
            if (this.packaging) {
                return this.packaging;
            } else {
                return false
            }
        },
        set_discount_to_line: function (discount) {
            if (discount != 0) {
                this.discount_reason = discount.reason;
                this.set_discount(discount.amount);
            } else {
                this.discount_reason = null;
                this.set_discount(0);
            }
        },
        set_unit: function (uom_id) {
            if (!this.pos.the_first_load && !uom_id) {
                return Gui.showPopup('ErrorPopup', {
                    title: _t('Error !!!'),
                    body: _t('Unit for set not found')
                })
            }
            this.uom_id = uom_id;
            const newPrice = this.product.get_price(this.pos._get_active_pricelist(), this.quantity, 0, this.uom_id);
            this.set_unit_price(newPrice);
            this.price_manually_set = true;
            return true;
        },
        get_units_price: function () {
            // TODO: each product we have multi unit (uom_ids), if current pricelist have set price for each unit, We return back all units available and price
            let units = [];
            if (!this.order.pricelist) {
                return units
            }
            let pricelist = this.order.pricelist;
            if (this.product.uom_ids && this.product.uom_ids.length) {
                let date = moment().startOf('day');
                let category_ids = [];
                let category = this.product.categ;
                while (category) {
                    category_ids.push(category.id);
                    category = category.parent;
                }
                for (let i = 0; i < this.product.uom_ids.length; i++) {
                    let uom_id = this.product.uom_ids[i];
                    let uom = this.pos.uom_by_id[uom_id];
                    let uom_has_price_included_pricelist = false;
                    for (let n = 0; n < pricelist.items.length; n++) {
                        let item = pricelist.items[n];
                        if ((!item.product_tmpl_id || item.product_tmpl_id[0] === this.product.product_tmpl_id) &&
                            (!item.product_id || item.product_id[0] === this.product.id) &&
                            (!item.categ_id || _.contains(category_ids, item.categ_id[0])) &&
                            (!item.date_start || moment(item.date_start).isSameOrBefore(date)) &&
                            (!item.date_end || moment(item.date_end).isSameOrAfter(date))) {
                            if (item.product_id && item.product_id[0] == this.product.id && item.uom_id && item.uom_id[0] == uom_id) {
                                uom_has_price_included_pricelist = true
                                break;
                            }
                        }
                    }
                    if (uom && uom_has_price_included_pricelist) {
                        let price = this.product.get_price(this.order.pricelist, 1, 0, uom_id);
                        units.push({
                            uom: uom,
                            price: price
                        })
                    }
                }
            }
            return units
        },
        // change_unit: function () {
        //     $('.uom-list').replaceWith();
        //     let product = this.product;
        //     let product_tmpl_id;
        //     if (product.product_tmpl_id instanceof Array) {
        //         product_tmpl_id = product.product_tmpl_id[0]
        //     } else {
        //         product_tmpl_id = product.product_tmpl_id;
        //     }
        //     let uom_items = this.pos.uoms_prices_by_product_tmpl_id[product_tmpl_id];
        //     if (!uom_items || !this.pos.config.change_unit_of_measure) {
        //         return;
        //     }
        //     let base_uom_id = product['base_uom_id'];
        //     if (base_uom_id) {
        //         let base_uom = this.pos.uom_by_id[base_uom_id[0]];
        //         base_uom['price'] = product.lst_price;
        //         base_uom['uom_id'] = [base_uom['id'], base_uom['name']];
        //         uom_items = uom_items.concat(base_uom)
        //     }
        //     if (uom_items.length) {
        //         $('.control-buttons-extend').empty();
        //         $('.control-buttons-extend').removeClass('oe_hidden');
        //         let multi_unit_widget = new MultiUnitWidget(this, {
        //             uom_items: uom_items,
        //             selected_line: this
        //         });
        //         multi_unit_widget.appendTo($('.control-buttons-extend'));
        //     }
        // },
        is_package: function () {
            if (!this.pos.packaging_by_product_id) {
                return false
            }
            let packagings = this.pos.packaging_by_product_id[this.product.id];
            if (packagings) {
                return true
            } else {
                return false
            }
        },
        is_cross_selling: function () {
            let self = this;
            let cross_items = _.filter(this.pos.cross_items, function (cross_item) {
                return cross_item['product_tmpl_id'][0] == self.product.product_tmpl_id;
            });
            if (cross_items.length) {
                return true
            } else {
                return false
            }
        },
        change_cross_selling: function () {
            let self = this;
            let cross_items = _.filter(this.pos.cross_items, function (cross_item) {
                return cross_item['product_tmpl_id'][0] == self.product.product_tmpl_id;
            });
            if (cross_items.length) {
                Gui.showPopup('popup_cross_selling', {
                    title: _t('Please, Suggest Customer buy more products bellow'),
                    widget: this,
                    cross_items: cross_items
                });
            } else {
                this.pos.alert_message({
                    title: _t('Warning'),
                    body: 'You not active cross selling or product have not items cross selling'
                });
            }
        },
        get_number_of_order: function () {
            let uid = this.uid;
            let order = this.order;
            for (let i = 0; i < order.orderlines.models.length; i++) {
                let line = order.orderlines.models[i];
                if (line.uid == uid) {
                    return i + 1
                }
            }
        },
        get_sale_person: function () {
            return this.seller;
        },
        set_sale_person: function (seller) {
            let order = this.order;
            if (this.pos.config.force_seller) {
                _.each(order.orderlines.models, function (line) {
                    line.seller = seller;
                    line.trigger('change', line);
                });
                order.seller = seller
            } else {
                this.seller = seller;
            }
            this.trigger('change', this);
        },
        get_price_without_quantity: function () {
            if (this.quantity != 0) {
                return this.get_price_with_tax() / this.quantity
            } else {
                return 0
            }
        },

        has_image() {
            if (this.pos.image_by_product_id[this.product.id]) {
                return true
            } else {
                return false
            }
        },

        get_line_image: function () {
            const product = this.product;
            return 'data:image/png;base64, ' + this.pos.image_by_product_id[product.id]
        },
        is_has_tags: function () {
            if (!this.tags || this.tags.length == 0) {
                return false
            } else {
                return true
            }
        },
        is_multi_variant: function () {
            let variants = this.pos.variant_by_product_tmpl_id[this.product.product_tmpl_id];
            if (!variants) {
                return false
            }
            if (variants.length > 0) {
                return true;
            } else {
                return false;
            }
        },
        // TODO: method return disc value each line
        get_price_discount: function () {
            const allPrices = this.get_all_prices();
            return allPrices['priceWithTaxBeforeDiscount'] - allPrices['priceWithTax']
        },
        get_unit: function () {
            if (!this.uom_id) {
                let unit_id = this.product.uom_id;
                if (!unit_id) {
                    return undefined;
                }
                unit_id = unit_id[0];
                if (!this.pos) {
                    return undefined;
                }
                let unit = this.pos.units_by_id[unit_id];
                return unit;
            } else {
                let unit_id = this.uom_id;
                let unit = this.pos.units_by_id[unit_id];
                return unit;
            }
        },
        is_multi_unit_of_measure: function () {
            let uom_items = this.pos.uoms_prices_by_product_tmpl_id[this.product.product_tmpl_id];
            if (!uom_items) {
                return false;
            }
            if (uom_items.length > 0) {
                return true;
            } else {
                return false;
            }
        },
        modifier_bom: function () {
            let self = this;
            let boms = this.is_has_bom();
            let bom_list = [];
            if (boms && boms.length > 0) {
                for (let i = 0; i < boms.length; i++) {
                    let bom = boms[i];
                    for (let j = 0; j < bom.bom_line_ids.length; j++) {
                        let bom_line = bom.bom_line_ids[j];
                        bom_line.quantity = bom_line.product_qty;
                    }
                    bom_list.push({
                        label: bom.code,
                        item: bom
                    })
                }
            }
            let bom_lines_set = this.get_bom_lines();
            if (bom_lines_set) {
                for (let i = 0; i < boms.length; i++) {
                    let bom = boms[i];
                    for (let j = 0; j < bom.bom_line_ids.length; j++) {
                        let bom_line = bom.bom_line_ids[j];
                        let bom_line_set = _.find(bom_lines_set, function (b) {
                            return b.bom_line.id == bom_line.id
                        })
                        if (bom_line_set) {
                            bom_line.quantity = bom_line_set.quantity
                        }
                    }
                }
            }
            this.add_bom = function (bom) {
                return Gui.showPopup('PopUpSelectionMultiQuantity', {
                    title: _t('Modifiers BOM of : ' + self.product.display_name),
                    fields: ['product_id', 'product_qty'],
                    sub_datas: bom['bom_line_ids'],
                    sub_search_string: null,
                    sub_record_by_id: null,
                    multi_choice: true,
                    sub_template: 'BomLines',
                    body: _t('Modifiers BOM of : ' + self.product.display_name),
                    confirm: function (bom_lines) {
                        self.set_bom_lines(bom_lines);
                    },
                    cancel: function () {
                        self.set_bom_lines([]);
                    }
                })
            }

            if (boms.length == 1) {
                return this.add_bom(boms[0])
            }
            return Gui.showPopup('selection', {
                title: _t('Alert, Please select one BOM for add to this Selected Line'),
                list: bom_list,
                confirm: function (bom) {
                    return self.add_bom(bom)
                }
            })
        },
        get_bom_lines: function () {
            if (!this.bom_lines) {
                return []
            } else {
                let bom_lines_added = []
                for (let i = 0; i < this.bom_lines.length; i++) {
                    let bom_line_item = this.bom_lines[i];
                    let bom_line = this.pos.bom_line_by_id[bom_line_item.id];
                    bom_lines_added.push({
                        bom_line: bom_line,
                        quantity: bom_line_item.quantity
                    })
                }
                return bom_lines_added
            }
        },
        set_bom_lines: function (bom_lines) {
            this.bom_lines = bom_lines;
            let price_extra = 0;
            for (let i = 0; i < bom_lines.length; i++) {
                let bom_line_set = bom_lines[i];
                let bom_line_record = this.pos.bom_line_by_id[bom_line_set.id]
                if (bom_line_record.price_extra >= 0) {
                    price_extra += bom_line_record.price_extra
                }
            }
            if (price_extra) {
                this.price_extra = price_extra;
            }
            this.trigger('change', this)
        },
        is_has_bom: function () {
            if (!this.pos.boms) {
                return false
            }
            if (this.pos.bom_by_product_id && this.pos.bom_by_product_id[this.product.id]) {
                return this.pos.bom_by_product_id[this.product.id]
            } else {
                const boms = this.pos.boms.filter(b =>
                    b.product_tmpl_id[0] == this.product.product_tmpl_id
                )
                if (boms.length > 0) {
                    return boms
                }
            }
            return false
        },
        // TODO: this is dynamic combo ( selected_combo_items is {product_id: quantity} )
        set_dynamic_combo_items: function (selected_combo_items) {
            let price_extra = 0;
            for (let product_id in selected_combo_items) {
                let product = this.pos.db.product_by_id[parseInt(product_id)];
                price_extra += product['combo_price'] * selected_combo_items[product_id];
            }
            this.selected_combo_items = selected_combo_items;
            if (price_extra) {
                this.price_extra = price_extra;
            }
            this.trigger('change', this);
        },
        is_combo: function () {
            for (let product_id in this.selected_combo_items) {
                return true
            }
            return false
        },
        has_combo_item_tracking_lot: function () {
            let tracking = false;
            for (let i = 0; i < this.pos.combo_items.length; i++) {
                let combo_item = this.pos.combo_items[i];
                if (combo_item['tracking']) {
                    tracking = true;
                }
            }
            return tracking;
        },

        set_quantity: function (quantity, keep_price) {
            if (this.pos.the_first_load == false && this.product.refundable == false && parseFloat(quantity) < 0) {
                return Gui.showPopup('ErrorPopup', {
                    title: _t('Error'),
                    body: this.product.display_name + _t(' Refundable is Unactive, not possible Discount it')
                })
            }
            let self = this;
            let update_combo_items = false;
            if (this.uom_id || this.redeem_point) {
                keep_price = 'keep price because changed uom id or have redeem point'
            }
            let qty_will_set = parseFloat(quantity);
            if (qty_will_set <= 0) {
                this.selected_combo_items = {}
                update_combo_items = true
            } else {
                for (let product_id in this.selected_combo_items) {
                    let qty_of_combo_item = this.selected_combo_items[product_id]
                    let new_qty = qty_will_set / this.quantity * qty_of_combo_item;
                    this.selected_combo_items[product_id] = new_qty
                    update_combo_items = true;
                }
            }
            let res = _super_Orderline.set_quantity.call(this, quantity, keep_price); // call style change parent parameter : keep_price
            if (!this.promotion && quantity == 'remove' || quantity == '') {
                this.order.remove_all_promotion_line();
            }
            if (update_combo_items) {
                this.set_dynamic_combo_items(this.selected_combo_items)
            }
            if (this.addon_ids) {
                this.set_addons(this.addon_ids)
            }
            if (this.combo_items && this.pos.config.screen_type != 'kitchen') { // if kitchen screen, no need reset combo items
                this.trigger('change', this);
            }
            let get_product_price_quantity = this.get_product_price_quantity_item(); // product price filter by quantity of cart line. Example: buy 1 unit price 1, buy 10 price is 0.5
            if (get_product_price_quantity) {
                setTimeout(function () {
                    self.syncing = true;
                    self.set_unit_price(get_product_price_quantity['price_unit']);
                    self.syncing = false;
                }, 500)
            }
            let order = this.order;
            let orderlines = order.orderlines.models;
            if (!order.fiscal_position || orderlines.length != 0) {
                for (let i = 0; i < orderlines.length; i++) { // reset taxes_id of line
                    orderlines[i]['taxes_id'] = [];
                }
            }
            if (order.fiscal_position && orderlines.length) {
                let fiscal_position = order.fiscal_position;
                let fiscal_position_taxes_by_id = fiscal_position.fiscal_position_taxes_by_id
                if (fiscal_position_taxes_by_id) {
                    for (let number in fiscal_position_taxes_by_id) {
                        let fiscal_tax = fiscal_position_taxes_by_id[number];
                        let tax_src_id = fiscal_tax.tax_src_id;
                        let tax_dest_id = fiscal_tax.tax_dest_id;
                        if (tax_src_id && tax_dest_id) {
                            for (let i = 0; i < orderlines.length; i++) { // reset taxes_id of line
                                orderlines[i]['taxes_id'] = [];
                            }
                            for (let i = 0; i < orderlines.length; i++) { // append taxes_id of line
                                let line = orderlines[i];
                                let product = line.product;
                                let taxes_id = product.taxes_id;
                                for (let number in taxes_id) {
                                    let tax_id = taxes_id[number];
                                    if (tax_id == tax_src_id[0]) {
                                        orderlines[i]['taxes_id'].push(tax_dest_id[0]);
                                    }
                                }
                            }
                        }
                    }
                } else {
                    for (let i = 0; i < orderlines.length; i++) { // reset taxes_id of line
                        orderlines[i]['taxes_id'] = [];
                    }
                }
            }
            if (this.coupon_ids && !this.pos.the_first_load) {
                this.pos.rpc({
                    model: 'coupon.generate.wizard',
                    method: 'remove_giftcards',
                    args: [[], this.coupon_ids],
                })
                this.coupon_ids = null;
                this.pos.alert_message({
                    title: this.pos.env._t('Alert'),
                    body: this.pos.env._t('Gift cards created before just removed')
                })
            }
            if (this.product.open_price && !this.restoring) {
                this._openPrice()
            }
            return res;
        },

        async _openPrice() {
            let {confirmed, payload: number} = await Gui.showPopup('NumberPopup', {
                'title': _t('What Price of Item ?'),
                'startingValue': 0,
            });
            if (confirmed) {
                this.set_unit_price(number);
            }
        },

        set_selected: function (selected) {
            _super_Orderline.set_selected.apply(this, arguments);
        },
        async set_discount(discount) {
            if (this.pos.the_first_load == false && this.product.discountable == false) {
                return this.pos.alert_message({
                    title: _t('Error'),
                    body: this.product.display_name + _t(' discountable is Unactive, not possible Discount it')
                });
            }
            if (parseFloat(discount) == 0) {
                return _super_Orderline.set_discount.apply(this, arguments);
            }
            if (!this.pos.the_first_load && this.pos.config.discount_limit && discount > this.pos.config.discount_limit_amount) {
                let validate = await this.pos._validate_action(_t(' Need set Discount: ') + discount + ' % .');
                if (!validate) {
                    return this.pos.alert_message({
                        title: _t('Error'),
                        body: _t('Your discount just set bigger than Discount limit % (POS Setting), and required Manager Approve it')
                    });
                }
            }
            _super_Orderline.set_discount.apply(this, arguments);
        },
        can_be_merged_with: function (orderline) {
            let merge = _super_Orderline.can_be_merged_with.apply(this, arguments);
            if (orderline.promotion || orderline.variants || orderline.is_return || orderline.discount_extra || orderline.price_extra || orderline['note'] || orderline['combo_items'] || orderline.product.is_combo || orderline.is_return || orderline.coupon_program_id || orderline.coupon_ids || orderline.coupon_id || (this.addon_ids && this.addon_ids.length)) {
                return false;
            }
            if (orderline && orderline.product && orderline.product.pos_categ_id && orderline.mp_dirty) { // if product have category is main, not allow merge
                const posCategory = this.pos.pos_category_by_id[orderline.product.pos_categ_id[0]]
                if (posCategory && posCategory['category_type'] == 'main') {
                    return false;
                }
            }
            // kimanh
            // if (merge == true && this.mp_dirty == false) { // this.mp_dirty it mean printed before
            //     return false
            // }
            if (orderline && orderline['product']['open_price']) {
                return false
            }
            return merge
        },
        callback_set_discount: function (discount) {
            this.pos.config.validate_discount_change = false;
            this.set_discount(discount);
            this.pos.config.validate_discount_change = true;
        },
        get_product_generic_options: function () {
            let options = []
            if (this.pos.generic_options) {
                for (let i = 0; i < this.pos.generic_options.length; i++) {
                    let generic = this.pos.generic_options[i];
                    if (generic.product_ids.indexOf(this.product.id) != -1) {
                        options.push(generic)
                    }
                }
            }
            return options
        }
    });
});
