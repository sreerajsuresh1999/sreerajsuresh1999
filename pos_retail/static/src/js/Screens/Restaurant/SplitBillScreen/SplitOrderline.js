odoo.define('pos_retail.SplitOrderline', function (require) {
    'use strict';

    const SplitOrderline = require('pos_restaurant.SplitOrderline');
    const Registries = require('point_of_sale.Registries');

    const RetailSplitOrderline = (SplitOrderline) =>
        class extends SplitOrderline {
            get isSelected() {
                if (this.props.split && this.props.split.quantity != undefined) {
                    return this.props.split.quantity !== 0;
                } else {
                    return false
                }

            }
        }
    Registries.Component.extend(SplitOrderline, RetailSplitOrderline);

    return RetailSplitOrderline;
});
