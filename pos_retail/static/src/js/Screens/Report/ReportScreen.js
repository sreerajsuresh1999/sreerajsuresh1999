odoo.define('pos_retail.ReportScreen', function (require) {
    'use strict';

    const {Printer} = require('point_of_sale.Printer');
    const {is_email} = require('web.utils');
    const {useRef, useContext} = owl.hooks;
    const {useErrorHandlers, onChangeOrder} = require('point_of_sale.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const AbstractReceiptScreen = require('point_of_sale.AbstractReceiptScreen');
    const session = require('web.session');
    const {useState} = owl.hooks;

    const ReportScreen = (AbstractReceiptScreen) => {
        class ReportScreen extends AbstractReceiptScreen {
            constructor() {
                super(...arguments);
                this.report_html = arguments[1].report_html
                useErrorHandlers();
                this.orderReceipt = useRef('order-receipt');
                const order = this.currentOrder;
                if (order) {
                    const client = order.get_client();
                    this.orderUiState = useContext(order.uiState.ReceiptScreen);
                    this.orderUiState.inputEmail = this.orderUiState.inputEmail || (client && client.email) || '';
                    this.is_email = is_email;
                }
            }

            mounted() {
                $(this.el).find('.pos-receipt-container').append(this.report_html)
                setTimeout(async () => await this.handleAutoPrint(), 0);
            }

            async sendReceiptViaWhatsApp() {
                let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                    title: this.env._t("What a WhatsApp Number need to send ?"),
                    startingValue: 0
                })
                if (confirmed) {
                    let mobile_no = number
                    let {confirmed, payload: messageNeedSend} = await this.showPopup('TextAreaPopup', {
                        title: this.env._t('What message need to send ?'),
                        startingValue: ''
                    })
                    if (confirmed) {
                        let message = messageNeedSend
                        const printer = new Printer(null, this.env.pos);
                        const ticketImage = await printer.htmlToImg(this.props.report_html);
                        let responseOfWhatsApp = await this.rpc({
                            model: 'pos.config',
                            method: 'send_receipt_via_whatsapp',
                            args: [[], this.env.pos.config.id, ticketImage, mobile_no, message],
                        }, {
                            shadow: true,
                            timeout: 60000
                        });
                        if (responseOfWhatsApp && responseOfWhatsApp['id']) {
                            return this.showPopup('ConfirmPopup', {
                                title: this.env._t('Successfully'),
                                body: this.env._t("Receipt send successfully to your Client's Phone WhatsApp: ") + mobile_no,
                                disableCancelButton: true,
                            })
                        } else {
                            return this.env.pos.alert_message({
                                title: this.env._t('Error'),
                                body: this.env._t("Send Receipt is fail, please check WhatsApp API and Token of your pos config or Your Server turn off Internet"),
                                disableCancelButton: true,
                            })
                        }
                    }
                }
            }

            async onSendEmail() {
                if (!this.orderUiState) {
                    return false
                }
                if (!is_email(this.orderUiState.inputEmail)) {
                    this.orderUiState.emailSuccessful = false;
                    this.orderUiState.emailNotice = 'Invalid email.';
                    return;
                }
                try {
                    await this._sendReceiptToCustomer();
                    this.orderUiState.emailSuccessful = true;
                    this.orderUiState.emailNotice = 'Email sent.'
                } catch (error) {
                    this.orderUiState.emailSuccessful = false;
                    this.orderUiState.emailNotice = 'Sending email failed. Please try again.'
                }
            }

            get currentOrder() {
                return this.env.pos.get_order();
            }

            back() {
                if (this.props.closeScreen) {
                    window.location = '/web#action=point_of_sale.action_client_pos_menu'
                    return true
                }
                this.trigger('close-temp-screen');
                if (this.env.pos.config.sync_multi_session && this.env.pos.config.screen_type == 'kitchen') {
                    return this.showScreen('KitchenScreen', {
                        'selectedOrder': this.props.orderRequest
                    })
                } else {
                    return this.showScreen('ProductScreen')
                }

            }

            async printReceipt() {
                if (this.env.pos.proxy.printer || (this.props.report_xml && this.env.pos.config.local_network_printer && this.pos.config.local_network_printer_ip_address && this.env.pos.config.local_network_printer_port)) {
                    this.handleAutoPrint()
                } else {
                    this._printWeb()
                }
            }

            async handleAutoPrint() {
                if (this.props.report_xml && this.env.pos.proxy.printer && this.env.pos.config.proxy_ip) {
                    this.env.pos.proxy.printer.printXmlReceipt(this.props.report_xml);
                }
                if (this.props.report_html && this.env.pos.proxy.printer && !this.env.pos.config.proxy_ip) {
                    this.env.pos.proxy.printer.print_receipt(this.props.report_html);
                }
                if (this.props.report_xml && this.env.pos.config.local_network_printer && this.env.pos.config.local_network_printer_ip_address && this.env.pos.config.local_network_printer_port) {
                    const printer = new Printer(null, this.env.pos);
                    printer.printViaNetwork(this.props.report_xml, 1);
                }
            }


            async _sendReceiptToCustomer() {
                const printer = new Printer();
                const receiptString = this.orderReceipt.comp.el.outerHTML;
                const ticketImage = await printer.htmlToImg(receiptString);
                const order = this.currentOrder;
                const client = order.get_client();
                const orderName = order.get_name();
                const orderClient = {
                    email: this.orderUiState.inputEmail,
                    name: client ? client.name : this.orderUiState.inputEmail
                };
                const order_server_id = this.env.pos.validated_orders_name_server_id_map[orderName];
                await this.rpc({
                    model: 'pos.order',
                    method: 'action_receipt_to_customer',
                    args: [[order_server_id], orderName, orderClient, ticketImage],
                });
            }
        }

        ReportScreen.template = 'ReportScreen';
        return ReportScreen;
    };

    Registries.Component.addByExtending(ReportScreen, AbstractReceiptScreen);

    return ReportScreen;
});
