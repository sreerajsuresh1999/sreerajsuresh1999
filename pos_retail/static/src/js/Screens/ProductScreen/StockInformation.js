odoo.define('pos_retail.StockInformation', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class StockInformation extends PosComponent {
        constructor() {
            super(...arguments);
            let qty_available = this.props.product.qty_available
            let currentStockLocation = this.env.pos.get_source_stock_location()
            this.stocks = [{
                location: currentStockLocation,
                quantity: qty_available,
                currentStock: true
            }]

        }

        async buildStock() {
            let stock_location_ids = this.env.pos.get_all_source_locations();
            let stock_datas = await this.env.pos.getStockDatasByLocationIds([this.props.product.id], stock_location_ids)
            let currentStockLocation = this.env.pos.get_source_stock_location()
            this.stocks = []
            for (let location_id in stock_datas) {
                let location = this.env.pos.stock_location_by_id[location_id];
                if (location) {
                    let stockValue = {
                        id: location.id,
                        location: location,
                        location_id: location.id,
                        quantity: stock_datas[location_id][this.props.product.id]
                    }
                    if (currentStockLocation && currentStockLocation.id == location.id) {
                        stockValue['currentStock'] = true
                    }
                    this.stocks.push(stockValue)
                }
            }
            this.render()
        }

        get stockDatas() {
            return this.stocks
        }

    }

    StockInformation.template = 'StockInformation';

    Registries.Component.add(StockInformation);

    return StockInformation;
});
