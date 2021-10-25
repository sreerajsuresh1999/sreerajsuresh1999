odoo.define('pos_retail.PosOrderLines', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class PosOrderLines extends PosComponent {
        constructor() {
            super(...arguments);
        }

        get highlight() {
            return this.props.order !== this.props.selectedOrder ? '' : 'highlight';
        }
    }

    PosOrderLines.template = 'PosOrderLines';

    Registries.Component.add(PosOrderLines);

    return PosOrderLines;
});
