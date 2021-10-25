odoo.define('pos_retail.PosOrderScreenWidget', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class PosOrderScreenWidget extends PosComponent {
        async onClick() {
            const {confirmed, payload: result} = await this.showTempScreen(
                'PosOrderScreen',
                {
                    order: null,
                    selectedClient: null
                }
            );
        }

        mounted() {
            posbus.on('reload-orders', this, this.render);
        }

        willUnmount() {
            posbus.off('reload-orders', this, null);
        }

        get isHidden() {
            if (!this.env || !this.env.pos || !this.env.pos.config || (this.env && this.env.pos && this.env.pos.config && !this.env.pos.config.pos_orders_management)) {
                return true
            } else {
                return false
            }
        }

        get count() {
            if (this.env.pos && this.env.pos.db && this.env.pos.db.order_by_id) {
                let count = 0;
                for (let order_id in this.env.pos.db.order_by_id) {
                    count += 1
                }
                if (count != 0) {
                    return count
                } else {
                    return 0
                }
            } else {
                return 0
            }
        }
    }

    PosOrderScreenWidget.template = 'PosOrderScreenWidget';

    Registries.Component.add(PosOrderScreenWidget);

    return PosOrderScreenWidget;
});
