odoo.define('pos_retail.PosOrderRow', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;
    const field_utils = require('web.field_utils');

    class PosOrderRow extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({
                refresh: 'done',
            });
        }

        async _autoSyncBackend() {
            this.state.refresh = 'connecting'
            const self = this;
            let order_object = this.env.pos.get_model('pos.order');
            let orders = await this.rpc({
                model: 'pos.order',
                method: 'search_read',
                fields: order_object.fields,
                args: [[['id', '=', this.props.order.id]]]
            }).then(function (orders) {
                return orders
            }, function (error) {
                self.state.refresh = 'error'
                self.env.pos.set_synch('disconnected', 'Offline Mode')
            })
            if (!orders) return null
            if (orders.length == 1) {
                this.props.order = orders[0]
            }
            this.state.refresh = 'done'
            let create_date = field_utils.parse.datetime(this.props.order.create_date);
            this.props.order.create_date = field_utils.format.datetime(create_date);
            let date_order = field_utils.parse.datetime(this.props.order.date_order);
            this.props.order.date_order = field_utils.format.datetime(date_order);
            let pos_order_line_object = this.env.pos.get_model('pos.order.line');
            let lines = await this.rpc({
                model: 'pos.order.line',
                method: 'search_read',
                fields: pos_order_line_object.fields,
                args: [[['order_id', '=', this.props.order.id]]]
            }, {
                shadow: true,
                timeout: 7500
            }).then(function (lines) {
                return lines
            }, function (error) {
                self.state.refresh = 'error'
                self.env.pos.set_synch('disconnected', 'Offline Mode')
            })
            self.props.order['lines'] = lines
        }

        get highlight() {
            return this.props.order !== this.props.selectedOrder ? '' : 'highlight';
        }

        showMore() {
            const order = this.props.order;
            const link = window.location.origin + "/web#id=" + order.id + "&view_type=form&model=pos.order";
            window.open(link, '_blank')
        }
    }

    PosOrderRow.template = 'PosOrderRow';

    Registries.Component.add(PosOrderRow);

    return PosOrderRow;
});
