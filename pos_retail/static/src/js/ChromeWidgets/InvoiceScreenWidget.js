odoo.define('pos_retail.InvoiceScreenWidget', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class InvoiceScreenWidget extends PosComponent {
        async  onClick() {
            const {confirmed, payload: result} = await this.showTempScreen(
                'AccountMoveScreen',
                {
                    move: null,
                }
            );
            if (confirmed) {
                debugger
            }
        }

        mounted() {
            posbus.on('reload-orders', this, this.render);
        }

        willUnmount() {
            posbus.off('reload-orders', this, null);
        }

        get isHidden() {
            if (!this.env || !this.env.pos || !this.env.pos.config || (this.env && this.env.pos && this.env.pos.config && !this.env.pos.config.management_invoice)) {
                return true
            } else {
                return false
            }
        }

        get count() {
            if (this.env.pos && this.env.pos.db.invoice_ids && this.env.pos.db.invoice_ids.length > 0) {
                return this.env.pos.db.invoice_ids.length;
            } else {
                return 0
            }
        }
    }

    InvoiceScreenWidget.template = 'InvoiceScreenWidget';

    Registries.Component.add(InvoiceScreenWidget);

    return InvoiceScreenWidget;
});
