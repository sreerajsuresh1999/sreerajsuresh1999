odoo.define('pos_retail.KitchenOrderLine', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class KitchenOrderLine extends PosComponent {
        constructor() {
            super(...arguments);
            // this.state = {
            //     line: this.props.line,
            // };
        }

        get isHighlighted() {
            if (this.env.pos.config.screen_type == 'waiter') {
                return (this.props.line.selected && !['Removed', 'Paid', 'Cancelled', 'Kitchen Requesting Cancel'].includes(this.props.line.state)) || (this.props.line.state == 'Ready Transfer')
            } else {
                return (this.props.line.selected)
            }

        }

        get isCancelled() {
            return ['Removed', 'Paid', 'Cancelled', 'Kitchen Requesting Cancel'].includes(this.props.line.state)
        }
        get allowDisplay () {
            if (this.env.pos.config.display_all_product) {
                return true
            } else {
                var display = this.env.pos.db.is_product_in_category(this.env.pos.config.product_categ_ids, this.props.line.id);
                if (display) {
                    return true
                } else {
                    return false
                }
            }
        }

        get isSucceed() {
            if (['Done', 'Ready Transfer'].includes(this.props.line.state)) return true
            else return false
        }
    }

    KitchenOrderLine.template = 'KitchenOrderLine';

    Registries.Component.add(KitchenOrderLine);

    return KitchenOrderLine;
});
