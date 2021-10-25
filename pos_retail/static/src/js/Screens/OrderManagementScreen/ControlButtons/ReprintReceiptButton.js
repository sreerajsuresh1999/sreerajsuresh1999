odoo.define('pos_retail.ReprintReceiptButton', function (require) {
    'use strict';

    const ReprintReceiptButton = require('point_of_sale.ReprintReceiptButton');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const QWeb = core.qweb;

    const RetailReprintReceiptButton = (ReprintReceiptButton) =>
        class extends ReprintReceiptButton {
            async _onClick() {
                const order = this.orderManagementContext.selectedOrder;
                if (!order) return;
                if (this.env.pos.epson_printer_default || (this.env.pos.config.proxy_ip && this.env.pos.config.iface_print_via_proxy)) {
                    this.showTempScreen('ReprintReceiptScreen', {order: order});
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning, This feature of POS Odoo Original not Compatible with our module'),
                        body: this.env._t('If you need reprint Order Receipt, active POS Order Management and Go to POS Orders Screen reprint Receipt')
                    })
                } else {
                    super._onClick()
                }
            }
        }
    Registries.Component.extend(ReprintReceiptButton, RetailReprintReceiptButton);

    return RetailReprintReceiptButton;
});
