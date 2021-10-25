odoo.define('pos_retail.ButtonReturnMode', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonReturnMode extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        mounted() {
            this.env.pos.get('orders').on('add remove change', () => this.render(), this);
            this.env.pos.on('change:selectedOrder', () => this.render(), this);
            this.env.pos.get_order().orderlines.on('change', () => {
                this.render();
            });
        }

        willUnmount() {
            this.env.pos.get('orders').off('add remove change', null, this);
            this.env.pos.off('change:selectedOrder', null, this);
        }

        get isHighlighted() {
            let selectedOrder = this.env.pos.get_order();
            if (!selectedOrder || !selectedOrder.get_selected_orderline()) {
                return false
            }
            return true
        }


        async onClick() {
            if (this.env.pos.config.validate_return) {
                let validate = await this.env.pos._validate_action(this.env._t('Need Approve of Your Manager'));
                if (!validate) {
                    return false;
                }
            }
            let selectedOrder = this.env.pos.get_order();
            let returnMethod = null;
            if (this.env.pos.config.return_method_id) {
                returnMethod = this.env.pos.payment_methods.find((p) => this.env.pos.config.return_method_id && p.id == this.env.pos.config.return_method_id[0])
            }
            if (selectedOrder.orderlines.models.length <= 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your shopping cart is empty')
                })
            }
            let {confirmed, payload: text} = await this.showPopup('TextAreaPopup', {
                title: this.env._t('Return Mode active, take some notes why return Products ?'),
                startingValue: selectedOrder.get_note()
            })
            if (confirmed) {
                selectedOrder.set_note(text);
                selectedOrder.orderlines.models.forEach((l) => {
                    if (l.quantity >= 0) {
                        l.set_quantity(-l.quantity)
                    }
                })
                if (!returnMethod) {
                    return this.showScreen('PaymentScreen');
                } else {
                    selectedOrder.is_return = true;
                    selectedOrder.paymentlines.models.forEach(function (p) {
                        selectedOrder.remove_paymentline(p)
                    })
                    selectedOrder.add_paymentline(returnMethod);
                    let order_ids = this.env.pos.push_single_order(selectedOrder, {})
                    return this.showScreen('ReceiptScreen');
                }

            }
        }
    }

    ButtonReturnMode.template = 'ButtonReturnMode';

    ProductScreen.addControlButton({
        component: ButtonReturnMode,
        condition: function () {
            // return this.env.pos.config.return_products;
            return false
        },
    });

    Registries.Component.add(ButtonReturnMode);

    return ButtonReturnMode;
});
