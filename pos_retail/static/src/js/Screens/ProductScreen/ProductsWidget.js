odoo.define('pos_retail.ProductsWidget', function (require) {
    'use strict';

    const ProductsWidget = require('point_of_sale.ProductsWidget')
    const Registries = require('point_of_sale.Registries')
    const {posbus} = require('point_of_sale.utils')

    const RetailProductsWidget = (ProductsWidget) =>
        class extends ProductsWidget {
            constructor() {
                super(...arguments);
                this.productsRecommendations = []
                this.env.pos.set('search_extends_results', null)
            }

            mounted() {
                const self = this;
                super.mounted();
                posbus.on('reload-products-screen', this, this.render);
                this.env.pos.on(
                    'change:search_extends_results',
                    (pos, products) => {
                        console.log('search_extends_results')
                        console.log(products)
                    },
                    this
                );
                this.env.pos.on(
                    'change:ProductRecommendations',
                    (pos, productRecommentIds) => {
                        self.productsRecommendations = []
                        for (let i = 0; i < productRecommentIds.length; i++) {
                            let product = self.env.pos.db.get_product_by_id(productRecommentIds[i]);
                            if (product) {
                                self.productsRecommendations.push(product)
                            }
                        }
                        self.render()
                        setTimeout(() => {
                            self.productsRecommendations = []
                        }, 1000)

                    },
                    this
                );
                this.env.pos.on(
                    'change:productsModifiers',
                    (pos, product_ids) => {
                        self.product_modifier_ids = product_ids
                        self.product_modifiers = []
                        for (let i = 0; i < product_ids.length; i++) {
                            let product = self.env.pos.db.get_product_by_id(product_ids[i]);
                            if (product) {
                                product.modifiers = true
                                self.product_modifiers.push(product)
                            }
                        }
                        self.render()
                        setTimeout(() => {
                            self.product_modifier_ids = []
                            self.product_modifiers = []
                        }, 1000)
                    },
                    this
                );
                this.env.pos.on('change:selectedBrandId', this.render, this);
                this.env.pos.on('change:selectedSaleCategoryId', this.render, this);
            }

            willUnmount() {
                super.willUnmount();
                posbus.off('reload-products-screen', null, this);
                this.env.pos.off('change:selectedBrandId', null, this);
                this.env.pos.off('change:selectedSaleCategoryId', null, this);
                this.env.pos.off('change:search_extends_results', null, this);
                this.env.pos.off('change:ProductRecommendations', null, this);
            }

            // TODO: odoo original used this.searchWordInput = useRef('search-word-input') from ProductsWidgetControlPanel
            // but we not use it, we trigger this function for get event press Enter of user and try add product
            async _tryAddProduct(event) {
                const {searchWordInput} = event.detail;
                if (searchWordInput && searchWordInput.el) {
                    return super._tryAddProduct(event)
                } else {
                    const searchResults = this.productsToDisplay;
                    if (searchResults.length == 0) {
                        return true
                    }
                    if (searchResults.length === 1) {
                        this.trigger('click-product', searchResults[0]);
                        posbus.trigger('clear-search-bar')
                        this._clearSearch()
                    }
                }
            }

            get subcategories() {
                if (this.env.pos.config.categ_dislay_type == 'all') {
                    this.env.pos.pos_categories = this.env.pos.pos_categories.sort(function (a, b) {
                        return a.sequence - b.sequence
                    })
                    return this.env.pos.pos_categories
                } else {
                    return super.subcategories
                }
            }

            get hasNoCategories() {
                // kimanh: we force odoo for always return false, default odoo always hide if have not any categories
                return false
            }

            get selectedBrandId() {
                return this.env.pos.get('selectedBrandId');
            }

            get selectedSaleCategoryId() {
                return this.env.pos.get('selectedSaleCategoryId');
            }

            _updateSearch(event) {
                super._updateSearch(event)
                if (this.env.pos.config.quickly_look_up_product) {
                    const products = this.env.pos.db.getAllProducts().filter(p => p['plu_number'] == event.detail || p['barcode'] == event.detail || p['default_code'] == event.detail || p['name'] == event.detail)
                    if (products.length == 1) {
                        this.trigger('click-product', products[0]);
                        posbus.trigger('clear-search-bar')
                    }
                }
            }

            get productsToDisplay() {
                const self = this;
                if (this.productsRecommendations && this.productsRecommendations.length > 0) {
                    console.log('Render recommendations : ' + this.productsRecommendations.length)
                    return this.productsRecommendations
                }
                let productsWillDisplay = super.productsToDisplay;
                let search_extends_results = this.env.pos.get('search_extends_results')
                if (search_extends_results != null) {
                    productsWillDisplay = search_extends_results
                    if (this.selectedCategoryId && this.selectedCategoryId != 0) {
                        productsWillDisplay = productsWillDisplay.filter(p => p.pos_categ_id && p.pos_categ_id[0] == this.selectedCategoryId)
                    }
                }
                if (this.env.pos.config.hidden_product_ids && this.env.pos.config.hidden_product_ids.length > 0) {
                    productsWillDisplay = productsWillDisplay.filter(p => !this.env.pos.config.hidden_product_ids.includes(p.id))
                }
                if (this.selectedBrandId && this.selectedBrandId != 0) {
                    productsWillDisplay = productsWillDisplay.filter(p => p.product_brand_id && p.product_brand_id[0] == this.selectedBrandId)
                }
                if (this.selectedSaleCategoryId && this.selectedSaleCategoryId != 0) {
                    productsWillDisplay = productsWillDisplay.filter(p => p.categ_id && p.categ_id[0] == this.selectedSaleCategoryId)
                }
                // limited maximum display is 100 products
                let productsLimitedDisplay = []
                for (let i = 0; i < productsWillDisplay.length; i++) {
                    if (i <= this.env.pos.db.limit) {
                        productsLimitedDisplay.push(productsWillDisplay[i])
                    } else {
                        break
                    }
                }
                if (this.env.pos.config.display_onhand) {
                    const productsWillDisplayIds = _.pluck(productsLimitedDisplay, 'id')
                    const currentStockLocation = this.env.pos.get_source_stock_location()
                    this.env.pos.getStockDatasByLocationIds(productsWillDisplayIds, [currentStockLocation['id']]).then(function (stock_datas) {
                        for (let location_id in stock_datas) {
                            location_id = parseInt(location_id)
                            let location = self.env.pos.stock_location_by_id[location_id];

                            if (location) {
                                for (let product_id in stock_datas[location_id]) {
                                    let product = self.env.pos.db.get_product_by_id(product_id)
                                    if (product) {
                                        product.qty_available = stock_datas[location_id][product_id]
                                        self.env.pos.trigger('set.product.stock.on.hand', self.env.pos, product);
                                    }
                                }
                            }
                        }
                    }, function (error) {
                        console.error(error)
                    })
                }
                if (this.product_modifier_ids) {
                    productsLimitedDisplay = productsLimitedDisplay.filter(p => this.product_modifier_ids.indexOf(p.id) == -1)
                    productsLimitedDisplay = this.product_modifiers.concat(productsLimitedDisplay)
                }
                console.log('Displayed total products: ' + productsLimitedDisplay.length)
                return productsWillDisplay
            }

            _switchCategory(event) {
                super._switchCategory(event)
                if (event.detail == 0) { // Todo: event.detail is categoryID, if ID is 0, it mean go to root category and clear search
                    this._clearSearch()
                    this.render()
                }
            }

            async _clearSearch() {
                this.env.pos.set('selectedBrandId', 0);
                this.env.pos.set('selectedSaleCategoryId', 0);
                this.env.pos.set('search_extends_results', null)
                super._clearSearch()
            }

            get blockScreen() {
                const selectedOrder = this.env.pos.get_order();
                if (!selectedOrder || !selectedOrder.is_return) {
                    return false
                } else {
                    return true
                }
            }
        }
    Registries.Component.extend(ProductsWidget, RetailProductsWidget);

    return RetailProductsWidget;
});
