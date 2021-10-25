odoo.define('pos_retail.ButtonCreatePurchaseOrder', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonCreatePurchaseOrder extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
            this._currentOrder = this.env.pos.get_order();
            this._currentOrder.orderlines.on('change', this.render, this);
            this.env.pos.on('change:selectedOrder', this._updateCurrentOrder, this);
        }

        willUnmount() {
            this._currentOrder.orderlines.off('change', null, this);
            this.env.pos.off('change:selectedOrder', null, this);
        }

        get isHighlighted() {
            let order = this.env.pos.get_order();
            if (!order) {
                return false
            }
            if (order && order.get_client()) {
                return true
            } else {
                return false
            }
        }

        async onClick() {
            var self = this;
            let order = this.env.pos.get_order();
            if (order.get_orderlines().length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Your order is blank cart'),
                })
            }
            if (!order.get_client()) {
                const {confirmed, payload: newClient} = await this.showTempScreen(
                    'ClientListScreen',
                    {client: null}
                );
                if (confirmed) {
                    order.set_client(newClient);
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('Required choice Customer')
                    })
                }
            }
            let toDay = new Date().toISOString().split('T')[0];
            let {confirmed, payload: results} = await this.showPopup('PopUpCreatePurchaseOrder', {
                title: this.env._t('Create Purchase Order'),
                currency_id: this.env.pos.currency.id,
                note: order.get_note(),
                date_planned: toDay,
                currencies: this.env.pos.currencies
            })
            if (confirmed) {
                let client = order.get_client();
                var lines = order.get_orderlines();
                let popUpVal = results.values
                if (!popUpVal.date_planned) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('Date Planned is required')
                    })
                }
                let values = {
                    origin: order.name,
                    partner_id: client.id,
                    order_line: [],
                    payment_term_id: client['property_payment_term_id'] && client['property_payment_term_id'][0],
                    date_planned: popUpVal['date_planned'],
                    notes: popUpVal['note'],
                    currency_id: popUpVal.currency_id,
                };
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    var uom_id;
                    if (line['uom_id']) {
                        uom_id = line['uom_id']
                    } else {
                        uom_id = line.product.uom_id[0]
                    }
                    var taxes_id = [[6, false, line.product['supplier_taxes_id'] || []]];
                    values['order_line'].push([0, 0, {
                        product_id: line.product['id'],
                        name: line.product['display_name'],
                        product_qty: line['quantity'],
                        product_uom: uom_id,
                        price_unit: line.price,
                        taxes_id: taxes_id
                    }])
                }
                let po = await this.rpc({
                    model: 'purchase.order',
                    method: 'create_po',
                    args: [values, this.env.pos.config.purchase_order_state],
                }).then(function (po) {
                    return po
                }, function (err) {
                    return self.env.pos.query_backend_fail(err);
                })
                if (po) {
                    order.temporary = true;
                    order.trigger('change', order);
                    order.purchase_ref = po.name;
                    this.env.pos.db.remove_unpaid_order(order);
                    this.env.pos.db.remove_order(order['uid']);
                    let link = window.location.origin + "/web#id=" + po['id'] + "&view_type=form&model=purchase.order";
                    window.open(link, '_blank');
                    this.showScreen('ReceiptScreen');
                }
            }
        }
    }

    ButtonCreatePurchaseOrder.template = 'ButtonCreatePurchaseOrder';

    ProductScreen.addControlButton({
        component: ButtonCreatePurchaseOrder,
        condition: function () {
            return this.env.pos.config.create_purchase_order;
        },
    });

    Registries.Component.add(ButtonCreatePurchaseOrder);

    return ButtonCreatePurchaseOrder;
});
