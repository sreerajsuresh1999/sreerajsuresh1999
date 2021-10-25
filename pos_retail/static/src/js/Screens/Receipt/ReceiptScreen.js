odoo.define('pos_retail.ReceiptScreen', function (require) {
    'use strict';

    const ReceiptScreen = require('point_of_sale.ReceiptScreen');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const qweb = core.qweb;
    const {useListener} = require('web.custom_hooks');
    const {posbus} = require('point_of_sale.utils');
    var BarcodeEvents = require('barcodes.BarcodeEvents').BarcodeEvents;
    const {Printer} = require('point_of_sale.Printer');
    const framework = require('web.framework');

    const RetailReceiptScreen = (ReceiptScreen) =>
        class extends ReceiptScreen {
            constructor() {
                super(...arguments);
                this.buffered_key_events = []
                this._onKeypadKeyDown = this._onKeypadKeyDown.bind(this);
                useListener('show-popup', this.removeEventKeyboad);
            }

            mounted() {
                super.mounted()
                this.env.pos.on('reload:receipt', this.render, this);
                setTimeout(async () => await this.automaticNextScreen(), 0);
                posbus.on('closed-popup', this, this.addEventKeyboad);
                this.addEventKeyboad()
            }

            async _saveReceipt() {
                try {
                    const printer = new Printer();
                    const receiptString = this.orderReceipt.comp.el.outerHTML;
                    const ticketImage = await printer.htmlToImg(receiptString);
                    const order = this.currentOrder;
                    const orderName = order.get_name();
                    const order_server_id = this.env.pos.validated_orders_name_server_id_map[orderName];
                    await this.rpc({
                        model: 'pos.order',
                        method: 'saveReceipt',
                        args: [[], order_server_id, ticketImage],
                    });
                } catch (ex) {
                    return false
                }

            }

            async orderDone() {
                const selectedOrder = this.env.pos.get_order()
                if (this.env.pos.config.whatsapp_api && this.env.pos.config.whatsapp_token && this.env.pos.config.whatsapp_send_type == 'automatic' && selectedOrder && !selectedOrder.sendReceiptViaWhatApp) {
                    await this.sendReceiptViaWhatsApp()
                }
                if (selectedOrder) {
                    console.log('[orderDone]: Begin done order ' + selectedOrder.uid)
                }
                await this.autoPrintGiftCard(selectedOrder)
                if (selectedOrder && selectedOrder.skipOrder) {
                    console.warn('[orderDone] order is active skipOrder, not call finalize()')
                    return false
                }
                if (this.env.pos.config.save_receipt) {
                    await this._saveReceipt()
                }
                return super.orderDone()

            }

            async autoPrintGiftCard(selectedOrder) {
                if (!this.env.pos.couponPrograms) {
                    return true
                }
                const self = this
                for (let i = 0; i < selectedOrder.orderlines.models.length; i++) {
                    let line = selectedOrder.orderlines.models[i];
                    let productId = line.product.id
                    let couponHasProductGiftTheSameLine = self.env.pos.couponPrograms.find(c => c.gift_product_id && c.gift_product_id[0] == productId)
                    if (couponHasProductGiftTheSameLine) {
                        const wizardID = await this.rpc({
                            model: 'coupon.generate.wizard',
                            method: 'create',
                            args: [
                                {
                                    nbr_coupons: 1,
                                    generation_type: 'nbr_coupon',
                                    partners_domain: []
                                }
                            ]
                        })
                        let partner_id = null;
                        const selectedCustomer = selectedOrder.get_client();
                        let default_mobile_no = ''
                        if (selectedCustomer) {
                            partner_id = selectedCustomer.id
                            default_mobile_no = selectedCustomer['mobile'] || selectedOrder['phone']
                        }
                        let coupon_ids = await this.rpc({
                            model: 'coupon.generate.wizard',
                            method: 'generate_giftcards',
                            args: [[wizardID], partner_id, this.env.pos.config.id],
                            context: {
                                active_id: couponHasProductGiftTheSameLine.id,
                                active_ids: [couponHasProductGiftTheSameLine.id]
                            }
                        })
                        await this.rpc({
                            model: 'coupon.coupon',
                            method: 'write',
                            args: [coupon_ids, {
                                state: 'new',
                            }],
                        })
                        const coupon_model = this.env.pos.models.find(m => m.model == 'coupon.coupon')
                        if (coupon_model) {
                            this.env.pos.load_server_data_by_model(coupon_model)
                        }
                        await this.env.pos.do_action('coupon.report_coupon_code', {
                            additional_context: {
                                active_ids: [coupon_ids],
                            }
                        });
                    }
                }
            }

            async sendReceiptViaWhatsApp() {
                const printer = new Printer();
                const order = this.env.pos.get_order()
                const client = order.get_client();
                let mobile_no = ''
                if (!client || (!client['mobile'] && !client['phone'])) {
                    let {confirmed, payload: mobile_no} = await this.showPopup('NumberPopup', {
                        title: this.env._t("Are you want send Receipt to customer via WhatApps Number"),
                        body: this.env._t('Please input your Customer Phone/Mobile bellow.'),
                        startingValue: 0,
                        cancelText: this.env._t('No, Close'),
                        confirmText: this.env._t('Send')
                    })
                } else {
                    mobile_no = client.mobile || client.phone
                }
                if (mobile_no) {
                    const receiptString = this.orderReceipt.comp.el.outerHTML;
                    const ticketImage = await printer.htmlToImg(receiptString);
                    framework.blockUI()
                    let responseOfWhatsApp = await this.rpc({
                        model: 'pos.config',
                        method: 'send_receipt_via_whatsapp',
                        args: [[], this.env.pos.config.id, ticketImage, mobile_no, this.env.pos.config.whatsapp_message_receipt + ' ' + order['name']],
                    }, {
                        shadow: true,
                        timeout: 60000
                    }).then(function (responseOfWhatsApp) {
                        return responseOfWhatsApp

                    }, function (err) {
                        framework.unblockUI()
                    });
                    framework.unblockUI()
                    if (responseOfWhatsApp == false) {
                        return this.env.pos.alert_message({
                            title: this.env._t('Warning'),
                            body: this.env._t("Mobile Number wrong format, Please checking Mobile WhatsApp number of Client"),
                        })
                    }
                    if (responseOfWhatsApp && responseOfWhatsApp['id']) {
                        order.sendReceiptViaWhatApp = true;
                        return this.env.pos.alert_message({
                            title: this.env._t('Successfully send to: ') + mobile_no,
                            body: this.env._t("Receipt send successfully to your Client's Phone WhatsApp: ") + mobile_no,
                        })
                    } else {
                        return this.env.pos.alert_message({
                            title: this.env._t('Fail send Receipt to: ') + mobile_no,
                            body: this.env._t("Send Receipt is fail, please check WhatsApp API and Token of your pos config or Your Server turn off Internet"),
                        })
                    }
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t("Mobile number for send receipt via whatapps not found"),
                    })
                }
            }


            async automaticNextScreen() {
                if (this.env.pos.config.validate_order_without_receipt && this.currentOrder) {
                    // if (this.env.pos.config.iface_print_auto) {
                    //     await this.printReceipt()
                    //     await this.handleAutoPrint()
                    // }
                    // kimanh: disable it, if validate_order_without_receipt is active only set orderDone()
                    if (this.currentOrder.is_to_invoice() && this.currentOrder.get_client()) {
                        await this.downloadInvoice()
                    }
                    this.orderDone();
                }
            }

            async handleAutoPrint() {
                super.handleAutoPrint()
                if (this.env.pos.config.local_network_printer && this.env.pos.config.local_network_printer_ip_address && this.env.pos.config.local_network_printer_port) {
                    let printNumber = 1
                    if (this.env.pos.config.duplicate_receipt && this.env.pos.config.duplicate_number > 1) {
                        printNumber = this.env.pos.config.duplicate_number
                    }
                    const printer = new Printer(null, this.env.pos);
                    await printer.printViaNetwork(qweb.render('XmlReceipt', this.env.pos.getReceiptEnv()), printNumber);
                }
            }

            willUnmount() {
                super.willUnmount()
                this.env.pos.off('reload:receipt', null, this);
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
                    // -------------------------- product screen -------------
                    let key = '';
                    if (event.keyCode == 13 || event.keyCode == 39) { // enter or arrow right
                        $(this.el).find('.next').click()
                    }
                    if (event.keyCode == 68) { // d
                        $(this.el).find('.download').click()
                    }
                    if (event.keyCode == 80) { // p
                        $(this.el).find('.print').click()
                    }
                }
                this.buffered_key_events = [];
            }

            async downloadDeliveryReport() {
                this.env.pos.chrome.showNotification(this.env._t('Alert'), this.env._t('Waiting Download Delivery Report'))
                let order_ids = await this.rpc({
                    model: 'pos.order',
                    method: 'search_read',
                    domain: [['pos_reference', '=', this.currentOrder.name]],
                    fields: ['id', 'picking_ids', 'partner_id']
                })
                if (order_ids.length == 1) {
                    let backendOrder = order_ids[0]
                    if (backendOrder.picking_ids.length > 0) {
                        await this.env.pos.do_action('stock.action_report_picking', {
                            additional_context: {
                                active_ids: backendOrder.picking_ids,
                            }
                        })
                    }
                }
            }

            async downloaOrderReport() {
                this.env.pos.chrome.showNotification(this.env._t('Alert'), this.env._t('Waiting Download Order Report'))
                let order_ids = await this.rpc({
                    model: 'pos.order',
                    method: 'search_read',
                    domain: [['pos_reference', '=', this.currentOrder.name]],
                    fields: ['id', 'picking_ids', 'partner_id']
                })
                if (order_ids.length == 1) {
                    let backendOrder = order_ids[0]
                    await this.env.pos.do_action('pos_retail.report_pos_order', {
                        additional_context: {
                            active_ids: [backendOrder.id],
                        }
                    })
                }
            }

            async downloadInvoice() {
                let order_ids = await this.rpc({
                    model: 'pos.order',
                    method: 'search_read',
                    domain: [['pos_reference', '=', this.currentOrder.name]],
                    fields: ['id', 'account_move', 'partner_id']
                })
                if (order_ids.length == 1) {
                    let backendOrder = order_ids[0]
                    if (!backendOrder.account_move) {
                        let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                            title: this.env._t('Warning'),
                            body: this.env._t('Invoice not set for this Order, Are you want add Invoice ?')
                        })
                        if (confirmed) {
                            if (!backendOrder.partner_id) {
                                this.env.pos.alert_message({
                                    title: this.env._t('Alert'),
                                    body: this.env._t('Order missed Customer, please select  customer for create invoice')
                                })
                                this.env.pos.alert_message({
                                    title: this.env._t('Warning'),
                                    body: this.env._t('Required set Customer to Order to Processing to Invoice')
                                })
                                let {confirmed, payload: newClient} = await this.showTempScreen(
                                    'ClientListScreen',
                                    {client: null}
                                );
                                if (confirmed) {
                                    let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup',
                                        {
                                            title: this.env._t('Alert'),
                                            body: newClient['name'] + this.env._t(' will set to current Order, are you sure ?')
                                        }
                                    );
                                    if (confirmed) {
                                        this.env.pos.alert_message({
                                            title: this.env._t('Successfully'),
                                            body: this.env._t('Watiing few seconds for Download the Invoice')
                                        })
                                        await this.rpc({
                                            model: 'pos.order',
                                            method: 'write',
                                            args: [[backendOrder.id], {
                                                'partner_id': newClient.id
                                            }],
                                            context: {}
                                        })
                                        await this.rpc({
                                            model: 'pos.order',
                                            method: 'action_pos_order_invoice',
                                            args: [[backendOrder.id]],
                                        })
                                        await this.env.pos.do_action('point_of_sale.pos_invoice_report', {
                                            additional_context: {
                                                active_ids: [backendOrder.id],
                                            }
                                        })
                                    }

                                }
                            } else {
                                if (!backendOrder.account_move) {
                                    await this.rpc({
                                        model: 'pos.order',
                                        method: 'action_pos_order_invoice',
                                        args: [[backendOrder.id]],
                                    })
                                } else {
                                    await this.env.pos.do_action('point_of_sale.pos_invoice_report', {
                                        additional_context: {
                                            active_ids: [backendOrder.id],
                                        }
                                    })
                                }
                            }
                        }
                    } else {
                        await this.env.pos.do_action('point_of_sale.pos_invoice_report', {
                            additional_context: {
                                active_ids: [backendOrder.id],
                            }
                        })
                    }
                } else {
                    this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Order has Duplicate. We can not print the Invoice')
                    })
                }
            }
        }
    Registries.Component.extend(ReceiptScreen, RetailReceiptScreen);

    return RetailReceiptScreen;
});
