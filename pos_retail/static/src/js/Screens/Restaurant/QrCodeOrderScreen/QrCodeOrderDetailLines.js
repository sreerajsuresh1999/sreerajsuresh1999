odoo.define('pos_retail.QrCodeOrderDetailLines', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class QrCodeOrderDetailLines extends PosComponent {

        constructor() {
            super(...arguments);
        }
        get highlight() {
            return this.props.order !== this.props.selectedOrder ? '' : 'highlight';
        }

        get getOrderLines() {
            let orderLines = [];
            this.props.order.lines.forEach(l => orderLines.push(l[2]))
            return orderLines
        }
    }
    QrCodeOrderDetailLines.template = 'QrCodeOrderDetailLines';

    Registries.Component.add(QrCodeOrderDetailLines);

    return QrCodeOrderDetailLines;
});
