odoo.define('pos_retail.AbstractReceiptScreen', function (require) {
    'use strict';

    const AbstractReceiptScreen = require('point_of_sale.AbstractReceiptScreen');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const QWeb = core.qweb;

    const RetailAbstractReceiptScreen = (AbstractReceiptScreen) =>
        class extends AbstractReceiptScreen {
            constructor() {
                super(...arguments);
            }

            async _printReceipt() {
                if ((this.env.pos.epson_printer_default || (this.env.pos.config.local_network_printer && this.env.pos.config.local_network_printer_ip_address && this.env.pos.config.local_network_printer_port) || (this.env.pos.config.proxy_ip && this.env.pos.config.iface_print_via_proxy))) {
                    let printNumber = 1
                    if (this.env.pos.config.duplicate_receipt && this.env.pos.config.duplicate_number > 1) {
                        printNumber = this.env.pos.config.duplicate_number
                    }
                    if (!this.env.pos.reportXML) {
                        await this.env.pos.proxy.printer.printXmlReceipt(QWeb.render('XmlReceipt', this.env.pos.getReceiptEnv()), printNumber);
                        return true
                    } else {
                        const printResult = await this.env.pos.proxy.printer.printXmlReceipt(this.env.pos.reportXML);
                        if (printResult.successful) {
                            return true;
                        }
                    }
                } else {
                    return super._printReceipt()
                }
            }
        }
    Registries.Component.extend(AbstractReceiptScreen, RetailAbstractReceiptScreen);

    return RetailAbstractReceiptScreen;
});
