odoo.define('pos_retail.OrderSummary', function (require) {
    'use strict';

    const OrderSummary = require('point_of_sale.OrderSummary');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;
    const {posbus} = require('point_of_sale.utils');

    const RetailOrderSummary = (OrderSummary) =>
        class extends OrderSummary {
            constructor() {
                super(...arguments);
                this.state = useState({
                    screen: 'Products'
                });
            }

            mounted() {
                super.mounted();
                posbus.on('reset-screen', this, this._resetScreen);
                posbus.on('set-screen', this, this._setScreen);
                posbus.on('reset-screen', this, this._resetScreen);
            }

            willUnmount() {
                super.willUnmount();
                posbus.off('closed-popup', this, null);
                posbus.off('reset-screen', this, null);
                posbus.off('set-screen', this, null);
            }

            _resetScreen() {
                this.state.screen = 'Products'
            }

            _setScreen(screenName) {
                this.state.screen = screenName
            }

            async setDiscount() {
                let selectedOrder = this.env.pos.get_order();
                let {confirmed, payload: discount} = await this.showPopup('NumberPopup', {
                    title: this.env._t('Which value of discount Value would you apply to Order ?'),
                    startingValue: 0,
                    confirmText: this.env._t('Apply'),
                    cancelText: this.env._t('Remove Discount'),
                })
                if (confirmed) {
                    selectedOrder.set_discount_value(parseFloat(discount))
                }
            }

            async clearCart() {
                let selectedOrder = this.env.pos.get_order();
                if (selectedOrder.orderlines.models.length > 0) {
                    let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                        title: this.env._t('Warning !!!'),
                        body: this.env._t('Are you want remove all Items in Cart ?')
                    })
                    if (confirmed) {
                        selectedOrder.orderlines.models.forEach(l => selectedOrder.remove_orderline(l))
                        selectedOrder.orderlines.models.forEach(l => selectedOrder.remove_orderline(l))
                        selectedOrder.orderlines.models.forEach(l => selectedOrder.remove_orderline(l))
                        selectedOrder.orderlines.models.forEach(l => selectedOrder.remove_orderline(l))
                        selectedOrder.is_return = false;
                        this.env.pos.alert_message({
                            title: this.env._t('Successfully'),
                            body: this.env._t('Order is empty cart !')
                        })
                    }
                } else {
                    this.env.pos.alert_message({
                        title: this.env._t('Warning !!!'),
                        body: this.env._t('Your Order Cart is blank.')
                    })
                }
            }

            async setTaxes() {
                let order = this.env.pos.get_order();
                let selectedLine = order.get_selected_orderline();
                if (!selectedLine) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Have not any line in cart')
                    })
                }
                if (selectedLine.is_return || order.is_return) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('it not possible set taxes on Order return')
                    })
                }
                if (selectedLine) {
                    let taxes_id = selectedLine.product.taxes_id;
                    let taxes = [];
                    let update_tax_ids = this.env.pos.config.update_tax_ids || [];
                    this.env.pos.taxes.forEach(function (t) {
                        if (update_tax_ids.indexOf(t.id) != -1) {
                            if (taxes_id.indexOf(t.id) != -1) {
                                t.selected = true
                            }
                            taxes.push(t)
                        }
                    })
                    if (taxes.length) {
                        let {confirmed, payload: result} = await this.showPopup('PopUpSelectionBox', {
                            title: this.env._t('Select Taxes need to apply'),
                            items: taxes
                        })
                        let tax_ids = []
                        if (confirmed) {
                            if (result.items.length) {
                                tax_ids = result.items.filter((i) => i.selected).map((i) => i.id)
                                let taxesString = selectedLine.product.display_name + this.env._t(' applied Taxes: ')
                                result.items.forEach(t => {
                                    taxesString += t.name + '.'
                                })
                                this.env.pos.alert_message({
                                    title: this.env._t('Successfully set Taxes'),
                                    body: taxesString
                                })
                            } else {
                                this.env.pos.alert_message({
                                    title: this.env._t('Successfully remove all Taxes'),
                                    body: ''
                                })
                            }
                        }
                        await this._appliedTaxes(tax_ids)

                    }
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Please selected 1 line for set taxes')
                    })
                }

            }

            async _appliedTaxes(tax_ids) {
                let order = this.env.pos.get_order();
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Need Confirm ?'),
                    body: this.env._t('Apply Taxes Selected to All Line ?'),
                })
                if (!confirmed) {
                    order.get_selected_orderline().set_taxes(tax_ids);
                } else {
                    order.orderlines.models.forEach(l => {
                        l.set_taxes(tax_ids)
                    })
                }
            }
        }
    Registries.Component.extend(OrderSummary, RetailOrderSummary);

    return RetailOrderSummary;
});
