odoo.define('pos_retail.SaleOrderDetail', function (require) {
    'use strict';

    const {getDataURLFromFile} = require('web.utils');
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const core = require('web.core');
    const qweb = core.qweb;
    const {posbus} = require('point_of_sale.utils');

    class SaleOrderDetail extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('actionPrint', () => this.actionPrint());
            useListener('actionConfirmSale', () => this.actionConfirmSale());
            useListener('actionDone', () => this.actionDone());
            useListener('covertToPosOrder', () => this.covertToPosOrder());
        }

        async covertToPosOrder() {
            if (this.props.order.reserve_table_id && (!this.env.pos.tables_by_id || !this.env.pos.tables_by_id[this.props.order.reserve_table_id[0]])) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('Order Reserved for table: ') + this.props.order.reserve_table_id[1] + this.env._t(' .But your POS have not this Table, it not possible for customer can CheckIn')
                })
            }
            if (this.props.order.reserve_table_id) {
                let orders = this.env.pos.get('orders').models;
                let orderOfTable = orders.find(o => o.table && o.table['id'] == this.props.order.reserve_table_id[0])
                if (orderOfTable) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.props.order.reserve_table_id[1] + this.env._t(' have another Order on it. Please finish or remove it the first.')
                    })
                }
            }
            const last_covert_order = this.env.pos.get('orders').models.find(o => o.booking_id == this.props.order.id)
            if (last_covert_order) {
                last_covert_order.destroy({'reason': 'abandon'});
            }
            const lines = this.props.order['lines'];
            if (!lines) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Warning'),
                    body: this.env._t('Order Lines is blank')
                })
            }
            let order
            if (this.props.order.state == 'booked' && this.props.order.pos_order_id) {
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert !!!'),
                    body: this.env._t('This Order has covert to POS Order') + this.props.order.pos_order_id[1] + this.env._t(', Are you sure do it again ?'),
                })
                if (!confirmed) {
                    return false
                } else {
                    order = new models.Order({}, {pos: this.env.pos, temporary: false});
                    order['name'] = order['uid'] + '/' + this.props.order['name']
                }
            } else {
                order = new models.Order({}, {pos: this.env.pos, temporary: false});
                order['name'] = this.props.order['name'];
            }
            if (this.props.order.reserve_table_id[0]) {
                let table = this.env.pos.tables_by_id[this.props.order.reserve_table_id[0]]
                let floor = this.env.pos.floors_by_id[table.floor_id[0]];
                if (table && floor) {
                    order.table = table;
                    order.table_id = table.id;
                    order.floor = floor;
                    order.floor_id = floor.id;
                }
            }
            order['delivery_address'] = this.props.order['delivery_address'];
            order['delivery_date'] = this.props.order['delivery_date'];
            order['delivery_phone'] = this.props.order['delivery_phone'];
            order['booking_id'] = this.props.order['id'];
            var partner_id = this.props.order['partner_id'];
            var partner = this.env.pos.db.get_partner_by_id(partner_id[0]);
            if (partner) {
                order.set_client(partner);
            } else {
                this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Customer: ') + partner_id[1] + this.env._t(' not Available in Pos, please update this partner active on POS'),
                })
            }
            if (this.props.order.pricelist_id) {
                var pricelist = this.env.pos.pricelist_by_id[this.props.order.pricelist_id[0]]
                if (pricelist) {
                    order.set_pricelist(pricelist)
                }
            }
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (!this.env.pos.db.get_product_by_id(line.product_id[0])) {
                    this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: line.product_id[1] + this.env._t(' not found in POS'),
                    })
                    await this.rpc({
                        model: 'product.product',
                        method: 'force_write',
                        args: [[line.product_id[0]], {
                            'available_in_pos': true,
                            'sale_ok': true,
                            'active': true,
                        }],
                        context: {}
                    })
                    let products = await this.env.pos.getDatasByModel('product.product', [['id', '=', line.product_id[0]]])
                    this.env.pos.save_results('product.product', products)
                }
                let product = this.env.pos.db.get_product_by_id(line.product_id[0]);
                if (!product) {
                    continue
                }
                let new_line = new models.Orderline({}, {pos: this.env.pos, order: order, product: product});
                new_line.set_quantity(line.product_uom_qty, 'keep price');
                order.orderlines.add(new_line);
                new_line.set_discount(line.discount || 0);
                if (line.variant_ids) {
                    var variants = _.map(line.variant_ids, function (variant_id) {
                        if (this.env.pos.variant_by_id[variant_id]) {
                            return this.env.pos.variant_by_id[variant_id]
                        }
                    });
                    new_line.set_variants(variants);
                }
                if (line.pos_note) {
                    new_line.set_line_note(line.pos_note);
                }
                if (line.product_uom) {
                    var uom_id = line.product_uom[0];
                    var uom = this.env.pos.uom_by_id[uom_id];
                    if (uom) {
                        new_line.set_unit(line.product_uom[0]);
                    } else {
                        this.env.pos.alert_message({
                            title: this.env._t('Alert'),
                            body: this.env._t('Your pos have not unit ') + line.product_uom[1]
                        })
                    }
                }
                new_line.set_unit_price(line.price_unit);
            }
            const orders = this.env.pos.get('orders');
            orders.add(order);
            this.env.pos.set('selectedOrder', order);
            if (this.props.order['payment_partial_amount']) {
                var ref = this.env._t('This order have paid before: ') + this.env.pos.format_currency(this.props.order['payment_partial_amount']);
                ref += this.env._t(' Sale Order name: ') + this.props.order.name;
                var payment_partial_method_id = this.props.order['payment_partial_method_id'][0];
                var payment_method = _.find(this.env.pos.payment_methods, function (method) {
                    return method.id == payment_partial_method_id;
                });
                if (payment_method) {
                    order.add_paymentline(payment_method);
                    var paymentline = order.selected_paymentline;
                    paymentline.set_amount(this.props.order['payment_partial_amount']);
                    paymentline.add_partial_amount_before = true;
                    paymentline.set_reference(ref);
                }
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert, Order have paid one part before !!!'),
                    body: ref,
                    disableCancelButton: true,
                })
            }
            this.trigger('close-temp-screen');
        }

        async actionDone() {
            await this.rpc({
                model: 'sale.order',
                method: 'action_done',
                args:
                    [[this.props.order.id]],
                context: {
                    pos: true
                }
            })
            await this.env.pos.getSaleOrders();
            var new_order = this.env.pos.db.sale_order_by_id[this.props.order.id];
            this.props.order = new_order;
            this.render()
        }

        async actionConfirmSale() {
            await this.rpc({
                model: 'sale.order',
                method: 'action_confirm',
                args:
                    [[this.props.order.id]],
                context: {
                    pos: true
                }
            })
            await this.env.pos.getSaleOrders()
            var new_order = this.env.pos.db.sale_order_by_id[this.props.order.id];
            this.props.order = new_order;
            this.render()
        }

        async actionPrint() {
            await this.env.pos.do_action('sale.action_report_saleorder', {
                additional_context: {
                    active_ids: [this.props.order.id]
                }
            })
        }

        async downloadInvoice() {
            let order = this.props.order;
            let download_invoice = await this.env.pos.do_action('account.account_invoices', {
                additional_context: {
                    active_ids: [order.account_move[0]]
                }
            })
            return download_invoice
        }

        get partnerImageUrl() {
            const order = this.props.order;
            const partner = order.partner_id
            if (partner) {
                return `/web/image?model=res.partner&id=${partner[0]}&field=image_128&unique=1`;
            } else {
                return false;
            }
        }

        get OrderUrl() {
            const order = this.props.order;
            return window.location.origin + "/web#id=" + order.id + "&view_type=form&model=sale.order";
        }
    }

    SaleOrderDetail.template = 'SaleOrderDetail';

    Registries.Component.add(SaleOrderDetail);

    return SaleOrderDetail;
});
