odoo.define('pos_retail.ButtonCreateMrpOrder', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonCreateMrpOrder extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
            let order = this.env.pos.get_order();
            if (!order) {
                return false
            }
            if (order.selected_orderline && order.selected_orderline.is_has_bom()) {
                return true
            } else {
                return false
            }
        }

        async onClick() {
            var self = this;
            let order = this.env.pos.get_order();
            if (order.get_orderlines().length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Your order is blank cart'),
                })
            }
            if (order.selected_orderline && !order.selected_orderline.is_has_bom()) {
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: order.selected_orderline.product.display_name + this.env._t(' have not Bill of Material'),
                })
            }
            let selectedLine = order.selected_orderline;
            let bom_lines_set = selectedLine.get_bom_lines();
            if (bom_lines_set.length == 0) {
                bom_lines_set = selectedLine.is_has_bom()[0].bom_line_ids;
            } else {
                bom_lines_set = bom_lines_set.map((b_line) => b_line.bom_line)
            }
            let {confirmed, payload: results} = await this.showPopup('PopUpCreateMrpOrder', {
                title: this.env._t('Modifiers BOM and Create MRP Order'),
                items: bom_lines_set
            })
            if (confirmed) {
                let bom_lines = results.items;
                selectedLine.set_bom_lines(bom_lines);
                return this.CreateMrpProduct(selectedLine, bom_lines);
            }

        }

        async CreateMrpProduct(selectedLine, bom_lines_set) {
            var self = this;
            if (bom_lines_set) {
                let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                    title: this.env._t('How many items need Manufacturing Produce'),
                    startingValue: selectedLine.quantity,
                })
                if (confirmed) {
                    let mrpOrder = await this.rpc({
                        model: 'pos.order.line',
                        method: 'action_create_mrp_production_direct_from_pos',
                        args: [[],
                            this.env.pos.config.id,
                            selectedLine.order.name,
                            selectedLine.product.id,
                            parseFloat(number),
                            bom_lines_set
                        ],
                        context: {}
                    }, {
                        shadow: true,
                        timeout: 60000
                    }).then(function (mrp_production_value) {
                        return mrp_production_value
                    }, function (err) {
                        return self.env.pos.query_backend_fail(err);
                    })
                    selectedLine.mrp_production_id = mrpOrder.id;
                    selectedLine.mrp_production_state = mrpOrder.state;
                    selectedLine.mrp_production_name = mrpOrder.name;
                    selectedLine.trigger('change', selectedLine);
                    var booking_link = window.location.origin + "/web#id=" + mrpOrder.id + "&view_type=form&model=mrp.production";
                    window.open(booking_link, '_blank');
                }
            }
        }
    }

    ButtonCreateMrpOrder.template = 'ButtonCreateMrpOrder';

    ProductScreen.addControlButton({
        component: ButtonCreateMrpOrder,
        condition: function () {
            return this.env.pos.config.mrp;
        },
    });

    Registries.Component.add(ButtonCreateMrpOrder);

    return ButtonCreateMrpOrder;
});
