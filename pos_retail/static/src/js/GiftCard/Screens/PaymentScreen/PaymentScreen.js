odoo.define('pos_retail.WalletPaymentScreen', function (require) {
    'use strict';

    const PaymentScreen = require('point_of_sale.PaymentScreen');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const {posbus} = require('point_of_sale.utils');
    var core = require('web.core');
    var _t = core._t;

    const WalletPaymentScreen = (PaymentScreen) =>
        class extends PaymentScreen {
            constructor() {
                super(...arguments);
            }

            async createPaymentLine(paymentMethod) {
                var self = this
                var lines = this.env.pos.get_order().get_paymentlines();
                var order = this.env.pos.get_order();
                if (paymentMethod == 'giftCard') {
                    for (var i = 0; i < lines.length; i++) {
                        if (lines[i].payment_method.js_gift_card == 'giftCard') {
                            this.deletePaymentLine({detail: {cid: lines[i].cid}});
                        }
                    }
                    var order = this.env.pos.get_order();
                    if (order.getNetTotalTaxIncluded() <= 0) {
                        return
                    }
                    this.useGiftCardForPayment(self, lines, order)
                }
            }

            async useGiftCardForPayment(self, lines, order) {
                const {confirmed, payload} = await this.showPopup('giftCardRedeemPopup', {
                    title: this.env._t('Gift Card'),
                });
                if (confirmed) {
                    var self = this;
                    var order = self.env.pos.get_order();
                    var client = order.get_client();
                    var redeem_amount = payload.card_amount;
                    var code = payload.card_no;
                    self.redeem = payload.redeem
                    if (Number(redeem_amount) > 0) {
                        if (self.redeem && self.redeem.card_value >= Number(redeem_amount)) {
                            if (self.redeem.customer_id[0]) {
                                var vals = {
                                    'redeem_card_no': self.redeem.id,
                                    'redeem_card': code,
                                    'redeem_card_amount': redeem_amount,
                                    'redeem_remaining': self.redeem.card_value - redeem_amount,
                                    'card_customer_id': client ? client.id : self.redeem.customer_id[0],
                                    'customer_name': client ? client.name : self.redeem.customer_id[1],
                                    'expiry_date': self.redeem.expire_date,
                                };
                            } else {
                                var vals = {
                                    'redeem_card_no': self.redeem.id,
                                    'redeem_card': code,
                                    'redeem_card_amount': redeem_amount,
                                    'redeem_remaining': self.redeem.card_value - redeem_amount,
                                    'card_customer_id': order.get_client() ? order.get_client().id : false,
                                    'customer_name': order.get_client() ? order.get_client().name : '',
                                    'expiry_date': self.redeem.expire_date,
                                };
                            }

                            if (self.env.pos.config.gift_payment_method_id[0]) {
                                var cashregisters = null;
                                for (var j = 0; j < self.env.pos.payment_methods.length; j++) {
                                    if (self.env.pos.payment_methods[j].id === self.env.pos.config.gift_payment_method_id[0]) {
                                        cashregisters = self.env.pos.payment_methods[j];
                                    }
                                }
                            }
                            if (vals) {
                                if (cashregisters) {
                                    order.add_paymentline(cashregisters);
                                    order.selected_paymentline.set_amount(Math.max(redeem_amount), 0);
                                    order.selected_paymentline.set_giftcard_line_code(code);
                                    order.set_redeem_giftcard(vals);
                                }
                            }
                            this.trigger('close-popup');
                        } else {
                            self.env.pos.chrome.showNotification(self.env._t('Alert'), self.env._t('Please enter amount below card value'))
                        }
                    } else {
                        self.env.pos.chrome.showNotification(self.env._t('Alert'), self.env._t('Please enter valid amount'))
                    }
                }
            }

            async payment_back() {
                var product_ids = [this.env.pos.config.gift_card_product_id[0]]
                if (this.env.pos.get_order().get_orderlines().length != 0) {
                    if (this.env.pos.config.gift_card_product_id[0] && this.env.pos.get_order().get_orderlines()[0].product.id == this.env.pos.config.gift_card_product_id[0]) {
                        const {confirmed} = await this.showPopup('ConfirmPopup', {
                            title: this.env._t('You do not go back'),
                            body: this.env._t(
                                'Would you like to discart this order?'
                            ),
                        });
                        if (confirmed) {
                            this.env.pos.get_order().destroy({reason: 'abandon'});
                            posbus.trigger('order-deleted');
                            this.showScreen('ProductScreen');
                        }
                    } else {
                        this.showScreen('ProductScreen');
                    }

                } else {
                    this.showScreen('ProductScreen');
                }
            }
        };

    Registries.Component.extend(PaymentScreen, WalletPaymentScreen);

    return WalletPaymentScreen;
});
