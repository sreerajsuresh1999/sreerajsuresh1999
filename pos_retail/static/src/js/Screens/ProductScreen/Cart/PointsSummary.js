odoo.define('pos_retail.PointsSummary', function(require) {
'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const utils = require('web.utils');

    class PointsSummary extends PosComponent {
        get get_points() {
            return this.env.pos.get_order().get_client_points()
        }

        get order() {
            const order = this.env.pos.get_order()
            return order;
        }
    }
    PointsSummary.template = 'PointsSummary';

    Registries.Component.add(PointsSummary);

    return PointsSummary;
});
