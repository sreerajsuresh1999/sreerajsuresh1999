odoo.define('point_of_sale.CashBalanceLine', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class CashBalanceLine extends PosComponent {
        onKeyup(event) {
            if (event.key === "Enter" && event.target.value.trim() !== '') {
                this.trigger('create-new-item');
            }
        }
    }
    CashBalanceLine.template = 'CashBalanceLine';

    Registries.Component.add(CashBalanceLine);

    return CashBalanceLine;
});
