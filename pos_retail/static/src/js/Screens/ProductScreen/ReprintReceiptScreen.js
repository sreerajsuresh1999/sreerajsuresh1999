odoo.define('pos_retail.ReprintReceiptScreen', function (require) {
    'use strict';

    const ReprintReceiptScreen = require('point_of_sale.ReprintReceiptScreen');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');
    const {useState, useExternalListener} = owl.hooks;
    const {Printer} = require('point_of_sale.Printer');
    const OrderReceipt = require('point_of_sale.OrderReceipt');
    const framework = require('web.framework');

    const RetailReprintReceiptScreen = (ReprintReceiptScreen) =>
        class extends ReprintReceiptScreen {
            constructor() {
                super(...arguments);
                this._currentOrder = this.env.pos.get_order();
                if (!this._currentOrder) {
                    this._currentOrder = this.props.order
                }
                this._currentOrder.orderlines.on('change', this.render, this);
                useExternalListener(document, 'keyup', this._onHotkeys);
            }

            async sendReceiptViaWhatsApp() {
                const order = this.props.order;
                const client = order.get_client();
                let mobile_no = ''
                if (!client || (!client['mobile'] && !client['phone'])) {
                    let {confirmed, payload: mobile_no} = await this.showPopup('NumberPopup', {
                        title: this.env._t("What a WhatsApp Mobile/Phone number for send the Receipt ?"),
                        startingValue: 0
                    })
                } else {
                    mobile_no = client.mobile || client.phone
                }
                if (mobile_no) {
                    let fixture = document.createElement('div');
                    const orderReceipt = new (Registries.Component.get(OrderReceipt))(this, {order});
                    await orderReceipt.mount(fixture);
                    const receiptString = orderReceipt.el.outerHTML;
                    const printer = new Printer();
                    const ticketImage = await printer.htmlToImg(receiptString);
                    let responseOfWhatsApp = await this.rpc({
                        model: 'pos.config',
                        method: 'send_receipt_via_whatsapp',
                        args: [[], this.env.pos.config.id, ticketImage, mobile_no, this.env.pos.config.whatsapp_message_receipt + ' ' + order['name']],
                    }, {
                        shadow: true,
                        timeout: 60000
                    });
                    if (responseOfWhatsApp == false) {
                        return this.env.pos.alert_message({
                            title: this.env._t('Mobile Number wrong format'),
                            body: this.env._t("Please checking Mobile WhatsApp number of Client, could not send to: ") + mobile_no,
                            disableCancelButton: true,
                        })
                    }
                    if (responseOfWhatsApp && responseOfWhatsApp['id']) {
                        order.sendReceiptViaWhatApp = true;
                        return this.showPopup('ConfirmPopup', {
                            title: this.env._t('Successfully send to: ') + mobile_no,
                            body: this.env._t("Receipt send successfully to your Client's Phone WhatsApp: ") + mobile_no,
                            disableCancelButton: true,
                        })
                    } else {
                        return this.env.pos.alert_message({
                            title: this.env._t('Fail send Receipt to: ') + mobile_no,
                            body: this.env._t("Send Receipt is fail, please check WhatsApp API and Token of your pos config or Your Server turn off Internet"),
                            disableCancelButton: true,
                        })
                    }
                }
            }

            _onHotkeys(event) {
                if (event.key === 'Escape') {
                    posbus.trigger('reset-screen')
                } else if (event.key === 'b') {
                    this.tryReprint();
                    this.confirm()
                } else if (event.key === 'm') {
                    this.sendReceiptViaWhatsApp();
                }
            }

            confirm() { // single screen
                try {
                    super.confirm()
                } catch (ex) {
                    posbus.trigger('reset-screen')
                }
            }
        }
    Registries.Component.extend(ReprintReceiptScreen, RetailReprintReceiptScreen);

    return RetailReprintReceiptScreen;
});
