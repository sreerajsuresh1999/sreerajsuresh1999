odoo.define('pos_retail.SaleOrderRow', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const field_utils = require('web.field_utils');
    const {useState} = owl.hooks;

    class SaleOrderRow extends PosComponent {

        constructor() {
            super(...arguments);
            this.state = useState({
                refresh: 'done',
            });
        }

        async _autoSyncBackend() {
            this.state.refresh = 'connecting'
            let order_object = this.env.pos.get_model('sale.order');
            let orders = await this.rpc({
                model: 'sale.order',
                method: 'search_read',
                fields: order_object.fields,
                args: [[['id', '=', this.props.order.id]]]
            })
            this.state.refresh = 'done'
            this.props.order = orders[0]
            let create_date = field_utils.parse.datetime(this.props.order.create_date);
            this.props.order.create_date = field_utils.format.datetime(create_date);
            let date_order = field_utils.parse.datetime(this.props.order.date_order);
            this.props.order.date_order = field_utils.format.datetime(date_order);
            let sale_order_line_object = this.env.pos.get_model('sale.order.line');
            let lines = await this.rpc({
                model: 'sale.order.line',
                method: 'search_read',
                fields: sale_order_line_object.fields,
                args: [[['order_id', '=', this.props.order.id]]]
            })
            this.props.order['lines'] = lines
            this.render()
        }

        get getHighlight() {
            return this.props.order !== this.props.selectedOrder ? '' : 'highlight';
        }

        showMore() {
            const order = this.props.order;
            const link = window.location.origin + "/web#id=" + order.id + "&view_type=form&model=sale.order";
            window.open(link, '_blank')
        }
    }

    SaleOrderRow.template = 'SaleOrderRow';

    Registries.Component.add(SaleOrderRow);

    return SaleOrderRow;
});
