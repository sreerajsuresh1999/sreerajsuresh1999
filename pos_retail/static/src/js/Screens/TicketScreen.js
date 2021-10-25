odoo.define('pos_retail.TicketScreen', function (require) {
    'use strict';
    const TicketScreen = require('point_of_sale.TicketScreen');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const {posbus} = require('point_of_sale.utils');
    var BarcodeEvents = require('barcodes.BarcodeEvents').BarcodeEvents;

    const RetailTicketScreen = (TicketScreen) =>
        class extends TicketScreen {
            constructor() {
                super(...arguments);
                this.buffered_key_events = []
                this._onKeypadKeyDown = this._onKeypadKeyDown.bind(this);
                useListener('show-popup', this.removeEventKeyboad);
            }

            mounted() {
                super.mounted()
                posbus.on('closed-popup', this, this.addEventKeyboad);
                this.addEventKeyboad()
            }

            willUnmount() {
                super.willUnmount()
                posbus.off('closed-popup', this, null);
                this.removeEventKeyboad()
            }

            addEventKeyboad() {
                console.log('add event keyboard')
                $(document).off('keydown.productscreen', this._onKeypadKeyDown);
                $(document).on('keydown.productscreen', this._onKeypadKeyDown);
            }

            removeEventKeyboad() {
                console.log('remove event keyboard')
                $(document).off('keydown.productscreen', this._onKeypadKeyDown);
            }

            _onKeypadKeyDown(ev) {
                if (!_.contains(["INPUT", "TEXTAREA"], $(ev.target).prop('tagName'))) {
                    clearTimeout(this.timeout);
                    this.buffered_key_events.push(ev);
                    this.timeout = setTimeout(_.bind(this._keyboardHandler, this), BarcodeEvents.max_time_between_keys_in_ms);
                }
                if (ev.keyCode == 27) {  // esc key
                    this.buffered_key_events.push(ev);
                    this.timeout = setTimeout(_.bind(this._keyboardHandler, this), BarcodeEvents.max_time_between_keys_in_ms);
                }
            }

            _keyboardHandler() {
                if (this.buffered_key_events.length > 2) {
                    this.buffered_key_events = [];
                    return true;
                }
                for (let i = 0; i < this.buffered_key_events.length; i++) {
                    let event = this.buffered_key_events[i]
                    console.log(event.keyCode)
                    if (event.keyCode == 27) { // esc
                        $(this.el).find('.search >input').blur()
                        $(this.el).find('.search >input')[0].value = "";
                    }
                    if (event.keyCode == 46) { // del
                        let selectedOrder = this.env.pos.get_order();
                        this.deleteOrder(selectedOrder)
                    }
                    if (event.keyCode == 66) { // b
                        $(this.el).find('.discard').click()
                    }
                    if (event.keyCode == 70) { // f
                        $(this.el).find('.filter').click()
                    }
                    if (event.keyCode == 78) { // n
                        this.createNewOrder()
                    }
                    if (event.keyCode == 83) { // s
                        $(this.el).find('.search >input').focus()
                    }
                }
                this.buffered_key_events = [];
            }

            getTable(order) {
                if (order.table) {
                    return super.getTable(order)
                } else {
                    return 'N/A'
                }
            }

            async createNewOrder() {
                if (this.env.pos.config.validate_new_order) {
                    let validate = await this.env.pos._validate_action(this.env._t('Need approve create new Order'));
                    if (!validate) {
                        return false;
                    }
                }
                return super.createNewOrder()
            }

            async removeAllOrders() {
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Warning'),
                    body: this.env._t('Are you sure remove all Orders ?')
                })
                if (confirmed) {
                    if (this.env.pos.config.validate_remove_order) {
                        let validate = await this.env.pos._validate_action(this.env._t('Need approve delete Order'));
                        if (!validate) {
                            return false;
                        }
                    }
                    const orders = this.env.pos.get('orders').models;
                    for (let i = 0; i < orders.length; i++) {
                        this.env.pos.saveOrderRemoved(orders[i])
                    }
                    orders.forEach(o => o.destroy({'reason': 'abandon'}))
                    orders.forEach(o => o.destroy({'reason': 'abandon'}))
                    orders.forEach(o => o.destroy({'reason': 'abandon'}))
                }
            }

            async deleteOrder(order) {
                if (this.env.pos.config.validate_remove_order && !order['temporary']) {
                    let validate = await this.env.pos._validate_action(this.env._t('Need approve delete Order'));
                    if (!validate) {
                        return false;
                    }
                }
                super.deleteOrder(order);
                this.env.pos.saveOrderRemoved(order)
            }

            get orderList() {
                return this.env.pos.get('orders').models;
            }

            hideDeleteButton(order) {
                if (!this.env.pos.config.allow_remove_order) {
                    return false
                } else {
                    return super.hideDeleteButton(order)
                }
            }

            async saveToPartialOrder(selectedOrder) {
                let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert'),
                    body: this.env._t("Are you want save current Order to Draft Order ?"),
                })
                if (confirmed) {
                    if (selectedOrder.get_total_with_tax() <= 0 || selectedOrder.orderlines.length == 0) {
                        return this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: this.env._t('Order has Empty Cart or Amount Total smaller than or equal 0')
                        })
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
                        let validate = await this.env.pos._validate_action(this.env._t('Order add Coupon, Required need Manager Approve'));
                        if (!validate) {
                            return false;
                        }
                    }
                    if (this.env.pos.config.validate_payment) {
                        let validate = await this.env.pos._validate_action(this.env._t('Need Approve Payment'));
                        if (!validate) {
                            return false;
                        }
                    }
                    let lists = this.env.pos.payment_methods.filter((p) => (p.journal && p.pos_method_type && p.pos_method_type == 'default') || (!p.journal && !p.pos_method_type)).map((p) => ({
                        id: p.id,
                        item: p,
                        label: p.name
                    }))
                    let {confirmed, payload: paymentMethod} = await this.showPopup('SelectionPopup', {
                        title: this.env._t('Save Order to Partial Order, Please select one Payment Method !!'),
                        list: lists
                    })
                    if (confirmed) {
                        let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                            title: this.env._t('How much Amount Customer need Paid ? Total Amount Order is: ') + this.env.pos.format_currency(selectedOrder.get_total_with_tax()),
                            startingValue: 0
                        })
                        if (confirmed) {
                            this.selectOrder(selectedOrder)
                            number = parseFloat(number)
                            if (number < 0 || number > selectedOrder.get_total_with_tax()) {
                                return this.showPopup('ErrorPopup', {
                                    title: this.env._t('Warning'),
                                    body: this.env._t('Your register Amount bigger than Total Amount Order, Required smaller than or equal Total Amount Order')
                                })
                            }
                            if (number > 0) {
                                let paymentLines = selectedOrder.paymentlines.models
                                paymentLines.forEach(function (p) {
                                    selectedOrder.remove_paymentline(p)
                                })
                                selectedOrder.add_paymentline(paymentMethod);
                                let paymentline = selectedOrder.selected_paymentline;
                                paymentline.set_amount(number);
                                selectedOrder.trigger('change', selectedOrder);
                            }
                            this.env.pos.push_single_order(selectedOrder, {
                                draft: true
                            })
                            this.showPopup('TextInputPopup', {
                                title: this.env._t('Receipt Number: ') + selectedOrder['name'],
                                startingValue: selectedOrder['name'],
                                confirmText: this.env._t('Ok'),
                                cancelText: this.env._t('Close'),
                            });
                            return this.showScreen('ReceiptScreen');
                        }
                    }
                }
            }
        }
    Registries.Component.extend(TicketScreen, RetailTicketScreen);

    return RetailTicketScreen;
});
