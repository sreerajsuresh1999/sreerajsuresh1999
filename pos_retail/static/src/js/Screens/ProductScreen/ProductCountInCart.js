odoo.define('pos_retail.ProductCountInCart', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class ProductCountInCart extends PosComponent {
        constructor() {
            super(...arguments);
            this._currentOrder = this.env.pos.get_order();
            if (this._currentOrder) {
                this._currentOrder.orderlines.on('change', this.render, this);
                this.env.pos.on('change:selectedOrder', this._updateCurrentOrder, this);
            }
        }


        willUnmount() {
            super.willUnmount();
            if (this._currentOrder) {
                this._currentOrder.orderlines.off('change', null, this);
            }
            this.env.pos.off('change:selectedOrder', null, this);
        }

        _updateCurrentOrder(pos, newSelectedOrder) {
            if (this._currentOrder) {
                this._currentOrder.orderlines.off('change', null, this);
            }
            if (newSelectedOrder) {
                this._currentOrder = newSelectedOrder;
                this._currentOrder.orderlines.on('change', this.render, this);
            }
            this.render()
        }

        get itemInCart() {
            let product = this.props.product;
            let selectedOrder = this._currentOrder;
            let totalItems = 0
            if (selectedOrder) {
                let orderLines = _.filter(selectedOrder.orderlines.models, function (o) {
                    return o.product.id == product.id
                })
                orderLines.forEach(function (l) {
                    totalItems += l.quantity
                })
            }
            return totalItems
        }
    }

    ProductCountInCart.template = 'ProductCountInCart';

    Registries.Component.add(ProductCountInCart);

    return ProductCountInCart;
});
