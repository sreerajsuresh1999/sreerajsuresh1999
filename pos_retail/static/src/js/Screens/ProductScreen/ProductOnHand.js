odoo.define('pos_retail.ProductOnHand', function (require) {
    'use strict';
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;

    class ProductOnHand extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({
                refreshStock: 'done',
                outstock: false,
                qty_available: this.props.product.qty_available
            });
        }

        mounted() {
            const self = this
            super.mounted();
            this.env.pos.on('reload.quantity.available', () => this.reloadStock(), this);
            this.env.pos.on( // TODO: get trigger from method productsToDisplay of ProductsWidget
                'set.product.stock.on.hand',
                (pos, product) => {
                    if (self.props.product.id == product.id && self.state.qty_available != product.qty_available) {
                        self.state.qty_available = product.qty_available
                        if (product.qty_available <= 0) {
                            self.state.outstock = true
                        }
                    }
                },
                this
            );
        }

        willUnmount() {
            super.willUnmount();
            this.env.pos.off('reload.quantity.available', null, this);
        }

        reloadStock() {
            const self = this
            if (this.env.pos.get_order() && this.state.refreshStock != 'connecting') {
                this.env.pos.set_synch('connecting', '')
                let currentStockLocation = this.env.pos.get_source_stock_location()
                this.state.refreshStock = 'connecting'
                this.env.pos.getStockDatasByLocationIds([this.props.product.id], [currentStockLocation['id']]).then(function (stock_datas) {
                    for (let location_id in stock_datas) {
                        location_id = parseInt(location_id)
                        let location = self.env.pos.stock_location_by_id[location_id];
                        if (location) {
                            self.props.product.qty_available = stock_datas[location_id][self.props.product.id]
                            if (self.props.product.qty_available <= 0) {
                                self.state.outstock = true
                            } else {
                                self.state.outstock = false
                            }
                            self.state.qty_available = self.props.product.qty_available
                        }
                    }
                    self.env.pos.set_synch('connected', '')
                    setTimeout(() => {
                        self.state.refreshStock = 'done'
                    }, 1000)
                }, function (error) {
                    setTimeout(() => {
                        self.state.refreshStock = 'fail'
                    }, 1000)
                    self.env.pos.set_synch('disconnected', self.env._t('Offline Mode'))
                })
            }
        }
    }

    ProductOnHand.template = 'ProductOnHand';

    Registries.Component.add(ProductOnHand);

    return ProductOnHand;
});
