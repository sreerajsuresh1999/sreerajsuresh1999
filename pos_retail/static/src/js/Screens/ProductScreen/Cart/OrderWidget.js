odoo.define('pos_retail.OrderWidget', function (require) {
        'use strict';

        const OrderWidget = require('point_of_sale.OrderWidget');
        const Registries = require('point_of_sale.Registries');
        const {useState, useRef, onPatched} = owl.hooks;

        const RetailOrderWidget = (OrderWidget) =>
            class extends OrderWidget {
                constructor() {
                    super(...arguments);
                    this.state = useState({
                        total: 0,
                        tax: 0,
                        discount: 0,
                        totalWithOutTaxes: 0,
                        margin: 0,
                        totalItems: 0,
                        totalQuantities: 0,
                    });
                }

                _selectLine(event) {
                    super._selectLine(event)
                }

                async _editPackLotLines(event) {
                    let self = this;
                    const orderline = event.detail.orderline;
                    const isAllowOnlyOneLot = orderline.product.isAllowOnlyOneLot();
                    const packLotLinesToEdit = orderline.getPackLotLinesToEdit(isAllowOnlyOneLot);
                    if (packLotLinesToEdit.length == 1 && packLotLinesToEdit[0].text == "" && this.env.pos.config.fullfill_lots && ['serial', 'lot'].includes(orderline.product.tracking)) {
                        let packLotLinesToEdit = await this.rpc({
                            model: 'stock.production.lot',
                            method: 'search_read',
                            domain: [['product_id', '=', orderline.product.id]],
                            fields: ['name', 'id']
                        }).then(function (value) {
                            return value
                        }, function (error) {
                            self.env.pos.query_backend_fail(error)
                            return false
                        })
                        if (!packLotLinesToEdit) {
                            packLotLinesToEdit = this.env.pos.lots.filter(l => l.product_id && l.product_id[0] == product['id'])
                        }
                        let newPackLotLinesToEdit = packLotLinesToEdit.map((lot) => ({text: lot.name}));
                        const {confirmed, payload} = await this.showPopup('EditListPopup', {
                            title: this.env._t('Selection only 1 Lot/Serial Number(s). It a required'),
                            isSingleItem: isAllowOnlyOneLot,
                            array: newPackLotLinesToEdit,
                        });
                        if (confirmed) {
                            const modifiedPackLotLines = Object.fromEntries(
                                payload.newArray.filter(item => item.id).map(item => [item.id, item.text])
                            );
                            const newPackLotLines = payload.newArray
                                .filter(item => !item.id)
                                .map(item => ({lot_name: item.text}));
                            if (newPackLotLines.length == 1) {
                                orderline.setPackLotLines({modifiedPackLotLines, newPackLotLines});
                            } else {
                                return this.env.pos.alert_message({
                                    title: this.env._t('Warning'),
                                    body: this.env._t('Please select only one Lot/Serial')
                                })
                            }
                        }
                        this.order.select_orderline(event.detail.orderline);
                    } else {
                        await super._editPackLotLines(event)
                    }
                }

                _updateSummary() {
                    if (this.order && this.order.get_client() && this.env.pos.retail_loyalty) {
                        let points = this.order.get_client_points()
                        let plus_point = points['plus_point']
                        this.order.plus_point = plus_point
                        this.order.redeem_point = points['redeem_point']
                        this.order.remaining_point = points['remaining_point']
                    }
                    let productsSummary = {}
                    let totalItems = 0
                    let totalQuantities = 0
                    let totalCost = 0
                    if (this.order) {
                        for (let i = 0; i < this.order.orderlines.models.length; i++) {
                            let line = this.order.orderlines.models[i]
                            totalCost += line.product.standard_price * line.quantity
                            if (!productsSummary[line.product.id]) {
                                productsSummary[line.product.id] = line.quantity
                                totalItems += 1
                            } else {
                                productsSummary[line.product.id] += line.quantity
                            }
                            totalQuantities += line.quantity
                        }
                    }
                    const discount = this.order ? this.order.get_total_discounts() : 0;
                    this.state.discount = this.env.pos.format_currency(discount);
                    const totalWithOutTaxes = this.order ? this.order.get_total_without_tax() : 0;
                    this.state.totalWithOutTaxes = this.env.pos.format_currency(totalWithOutTaxes);
                    this.state.margin = this.env.pos.format_currency(totalWithOutTaxes - totalCost)
                    this.state.totalItems = this.env.pos.format_currency_no_symbol(totalItems)
                    this.state.totalQuantities = this.env.pos.format_currency_no_symbol(totalQuantities)
                    super._updateSummary();
                    const total = this.order ? this.order.get_total_with_tax() : 0;
                    if (total <= 0) {
                        this.state.tax = this.env.pos.format_currency(0);
                        this.render()
                    }
                    // this.env.pos.trigger('product.updated');
                    this.env.pos.trigger('refresh.customer.facing.screen');
                }
            }

        Registries.Component.extend(OrderWidget, RetailOrderWidget);

        return RetailOrderWidget;
    }
);
