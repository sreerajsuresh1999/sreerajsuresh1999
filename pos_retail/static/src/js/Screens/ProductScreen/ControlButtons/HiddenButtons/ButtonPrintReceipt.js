odoo.define('point_of_sale.ButtonPrintReceipt', function (require) {
    'use strict';

    const {useListener} = require('web.custom_hooks');
    const {useContext} = owl.hooks;
    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const Registries = require('point_of_sale.Registries');
    const OrderReceipt = require('point_of_sale.OrderReceipt');
    const contexts = require('point_of_sale.PosContext');
    const qweb = require('web.core').qweb;

    class ButtonPrintReceipt extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this._onClick);
            this.orderManagementContext = useContext(contexts.orderManagement);
        }

        async _onClick() {
            const order = this.env.pos.get_order();
            if (!order) return;
            if (this.env.pos.config.proxy_ip && this.env.pos.proxy.printer) {
                const printResult = this.env.pos.proxy.printer.printXmlReceipt(qweb.render('XmlReceipt', this.env.pos.getReceiptEnv()));
                if (printResult.successful) {
                    return true;
                } else {
                    this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Have something wrong about connection POSBOX and printer')
                    })
                    return false;
                }
            }
            if (this.env.pos.proxy.printer && !this.env.pos.config.proxy_ip) {
                const fixture = document.createElement('div');
                const orderReceipt = new (Registries.Component.get(OrderReceipt))(this, {order});
                await orderReceipt.mount(fixture);
                const receiptHtml = orderReceipt.el.outerHTML;
                const printResult = await this.env.pos.proxy.printer.print_receipt(receiptHtml);
                if (!printResult.successful) {
                    this.showTempScreen('ReprintReceiptScreen', {order: order});
                }
            } else {
                this.showTempScreen('ReprintReceiptScreen', {order: order});
            }
        }
    }

    ButtonPrintReceipt.template = 'ButtonPrintReceipt';

    ProductScreen.addControlButton({
        component: ButtonPrintReceipt,
        condition: function () {
            // return this.env.pos.config.review_receipt_before_paid;
            return false
        },
    });

    Registries.Component.add(ButtonPrintReceipt);

    return ButtonPrintReceipt;
});
