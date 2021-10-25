odoo.define('pos_retail.ButtonQuicklyPaid', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonQuicklyPaid extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
            return true
        }

        get getCount() {
            return this.count;
        }

        get selectedOrderline() {
            return this.env.pos.get_order().get_selected_orderline();
        }

        async onClick() {
            let selectedOrder = this.env.pos.get_order();
            if (selectedOrder.is_to_invoice() && !selectedOrder.get_client()) {
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Warning'),
                    body: this.env._t('Order will process to Invoice, please select one Customer for set to current Order'),
                    disableCancelButton: true,
                })
                const {confirmed, payload: newClient} = await this.showTempScreen(
                    'ClientListScreen',
                    {client: null}
                );
                if (confirmed) {
                    selectedOrder.set_client(newClient);
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Order will processing to Invoice, required set a Customer')
                    })
                }
            }
            const linePriceSmallerThanZero = selectedOrder.orderlines.models.find(l => l.get_price_with_tax() <= 0 && !l.coupon_program_id && !l.promotion)
            if (this.env.pos.config.validate_return && linePriceSmallerThanZero) {
                let validate = await this.env.pos._validate_action(this.env._t('Have one Line has Price smaller than or equal 0. Need Manager Approve'));
                if (!validate) {
                    return false;
                }
            }
            const lineIsCoupon = selectedOrder.orderlines.models.find(l => l.coupon_id || l.coupon_program_id);
            if (lineIsCoupon && this.env.pos.config.validate_coupon) {
                let validate = await this.env.pos._validate_action(this.env._t('Order add coupon, required need Manager Approve'));
                if (!validate) {
                    return false;
                }
            }
            if (this.env.pos.config.validate_payment) {
                let validate = await this.env.pos._validate_action(this.env._t('Need approve Payment'));
                if (!validate) {
                    return false;
                }
            }
            if (selectedOrder.get_total_with_tax() <= 0 || selectedOrder.orderlines.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('It not possible with empty cart or Amount Total order smaller than or equal 0')
                })
            }
            let quickly_payment_method = this.env.pos.payment_methods.find(m => m.id == this.env.pos.config.quickly_payment_method_id[0])
            if (!quickly_payment_method) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('You POS Config active Quickly Paid but not set add Payment Method: ') + this.env.pos.config.quickly_payment_method_id[1] + this.env._t('Payments/ Payment Methods')
                })
            }
            let paymentLines = selectedOrder.paymentlines.models
            paymentLines.forEach(function (p) {
                selectedOrder.remove_paymentline(p)
            })
            selectedOrder.add_paymentline(quickly_payment_method);
            var paymentline = selectedOrder.selected_paymentline;
            paymentline.set_amount(selectedOrder.get_total_with_tax());
            selectedOrder.trigger('change', selectedOrder);
            let order_ids = this.env.pos.push_single_order(selectedOrder, {})
            console.log('{ButtonQuicklyPaid.js} pushed succeed order_ids: ' + order_ids)
            const iface_print_auto = this.env.pos.config.iface_print_auto;
            this.env.pos.config.iface_print_auto = true
            this.showScreen('ReceiptScreen');
            this.env.pos.config.iface_print_auto = iface_print_auto
        }
    }

    ButtonQuicklyPaid.template = 'ButtonQuicklyPaid';

    ProductScreen.addControlButton({
        component: ButtonQuicklyPaid,
        condition: function () {
            return this.env.pos.config.quickly_payment_full;
        },
    });

    Registries.Component.add(ButtonQuicklyPaid);

    return ButtonQuicklyPaid;
});
