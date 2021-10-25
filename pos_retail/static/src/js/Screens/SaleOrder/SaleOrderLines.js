odoo.define('pos_retail.SaleOrderLines', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class SaleOrderLines extends PosComponent {
        get highlight() {
            return this.props.order !== this.props.selectedOrder ? '' : 'highlight';
        }

        get SaleOrderLines() {
            const order = this.props.order
            if (order['lines']) {
                return order['lines']
            } else {
                return []
            }
        }
    }

    SaleOrderLines.template = 'SaleOrderLines';

    Registries.Component.add(SaleOrderLines);

    return SaleOrderLines;
});
