odoo.define('pos_retail.KitchenTickets', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class KitchenTickets extends PosComponent {
        onClick() {
            posbus.trigger('reloadKitchenScreen', {})
            this.showScreen('KitchenScreen', {});
        }

        willPatch() {
            posbus.off('save-receipt', this);
        }

        patched() {
            posbus.on('save-receipt', this, this.render);
        }

        mounted() {
            posbus.on('save-receipt', this, this.render);
        }

        willUnmount() {
            posbus.off('save-receipt', this);
        }

        get isHidden() {
            if (!this.env || !this.env.pos || !this.env.pos.config || (this.env && this.env.pos && this.env.pos.config && this.env.pos.config.screen_type != 'kitchen' && !this.env.pos.config.kitchen_screen)) {
                return true
            } else {
                return false
            }
        }

        get count() {
            if (this.env.pos) {
                let receipts = this.env.pos.db.getOrderReceipts();
                if (this.env.pos.config.screen_type != 'kitchen') {
                    receipts = receipts.filter(r => r.state == "Ready Transfer")
                } else {
                    receipts = receipts.filter(r => r.state == "New")
                }
                return receipts.length;
            } else {
                return 0;
            }
        }
    }

    KitchenTickets.template = 'KitchenTickets';

    Registries.Component.add(KitchenTickets);

    return KitchenTickets;
});
