odoo.define('pos_retail.ButtonCreateShippingOrder', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const {Printer} = require('point_of_sale.Printer');
    const core = require('web.core');
    const _t = core._t;

    // TODO: let : là biến trong 1 khối, biến này được thay đổi giá trị và được duy trì trong khối mà thôi (khối là 1 block {} )
    // TODO: const : là 1 biến không bao giờ thay đổi và duy trì xuyên suốt trong 1 class

    class ButtonCreateShippingOrder extends PosComponent {
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
            var order = this.env.pos.get_order();
            if (order && order.is_return) {
                return false;
            }
            if (order.get_client()) {
                return true
            } else {
                return false
            }
        }

        _updateCurrentOrder(pos, newSelectedOrder) {
            this._currentOrder.orderlines.off('change', null, this);
            if (newSelectedOrder) {
                this._currentOrder = newSelectedOrder;
                this._currentOrder.orderlines.on('change', this.render, this);
            }
        }

        async onClick() {
            let self = this;
            let order = this.env.pos.get_order();
            if (order.get_total_with_tax() < 0 || order.orderlines.models.length == 0) {
                return this.showPopup('ConfirmPopup', {
                    title: _t('Alert'),
                    body: _t('Your shopping cart is empty or Amount total order smaller than 0'),
                })
            }
            if (!order.get_client()) {
                this.showPopup('ConfirmPopup', {
                    title: _t('Alert'),
                    body: _t('Shipping Order required select a Customer. Please select one Customer'),
                    disableCancelButton: true,
                })
                const {confirmed, payload: newClient} = await this.showTempScreen(
                    'ClientListScreen',
                    {client: null}
                );
                if (confirmed) {
                    order.set_client(newClient);
                } else {
                    return this.env.pos.alert_message({
                        title: _t('Alert'),
                        body: _t('Required choice Customer')
                    })
                }
            }
            const {confirmed, payload: values} = await this.showPopup('PopUpCreateShippingOrder', {
                title: this.env._t('Create Shipping POS Order'),
                order: order,
                client: order.get_client()
            })
            if (confirmed) {
                let client = order.get_client()
                var result = values.values;
                if (values.error) {
                    order.note = result['note'];
                    order.delivery_name = result['name'];
                    order.delivery_address = result['delivery_address'];
                    order.delivery_phone = result['delivery_phone'];
                    order.delivery_date = result['delivery_date'];
                    order.new_shipping_address = result['new_shipping_address'];
                    order.trigger('change', order);
                    const {confirmed, payload: response} = await this.env.pos.alert_message({
                        title: _t('Alert'),
                        body: values.error
                    })
                    if (confirmed) {
                        return this.onClick()
                    }
                }
                let client_val = {
                    name: result['name'],
                    phone: result['delivery_phone'],
                    property_product_pricelist: order.pricelist.id,
                    street: result['delivery_address'],
                };
                if (result.new_shipping_address) {
                    client_val['parent_id'] = client.id;
                    client_val['type'] = 'delivery';
                    client_val['id'] = null;
                } else {
                    client_val['id'] = client.id
                }
                if (result['note']) {
                    order.set_note(result['note']);
                }
                if (result['signature']) {
                    order.set_signature(result['signature']);
                }
                order.delivery_address = result.delivery_address;
                order.delivery_phone = result.delivery_phone;
                order.delivery_date = result.delivery_date;
                let client_id = await this.rpc({ // todo: template rpc
                    model: 'res.partner',
                    method: 'create_from_ui',
                    args: [client_val]
                }).then(function (client_id) {
                    return client_id
                }, function (err) {
                    return self.env.pos.query_backend_fail(err);
                })
                if (client_id) {
                    order.shipping_id = client_id;
                    order.trigger('change', order);
                    let order_ids = await this.env.pos.push_single_order(order, {
                        draft: true
                    })
                    this.showPopup('ConfirmPopup', {
                        title: this.env._t('New POS Shipping Order ID: ' + order_ids[0]),
                        body: this.env._t('Order saved to Draft State and waiting Delivery Shipping Order, When your Delivery Man Shipping succeed and come back, please Full Fill Payment Order: ') + order.name,
                        disableCancelButton: true,
                    })
                    return this.showScreen('ReceiptScreen');
                }
            }
        }
    }

    ButtonCreateShippingOrder.template = 'ButtonCreateShippingOrder';

    ProductScreen.addControlButton({
        component: ButtonCreateShippingOrder,
        condition: function () {
            return this.env.pos.config.shipping_order;
        },
    });

    Registries.Component.add(ButtonCreateShippingOrder);

    return ButtonCreateShippingOrder;
});
