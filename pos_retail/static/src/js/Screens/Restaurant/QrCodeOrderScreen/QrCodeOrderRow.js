odoo.define('pos_retail.QrCodeOrderRow', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class QrCodeOrderRow extends PosComponent {
        constructor() {
            super(...arguments);
        }
        get highlight() {
            return this.props.order !== this.props.selectedOrder ? '' : 'highlight';
        }
    }
    QrCodeOrderRow.template = 'QrCodeOrderRow';

    Registries.Component.add(QrCodeOrderRow);

    return QrCodeOrderRow;
});
