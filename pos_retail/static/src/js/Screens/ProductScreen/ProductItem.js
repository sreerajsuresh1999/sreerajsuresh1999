odoo.define('pos_retail.ProductItem', function (require) {
    'use strict';

    const ProductItem = require('point_of_sale.ProductItem');
    const Registries = require('point_of_sale.Registries');
    ProductItem.template = 'RetailProductItem';
    Registries.Component.add(ProductItem);
    const core = require('web.core');
    const qweb = core.qweb;
    const {useState} = owl.hooks;
    const {posbus} = require('point_of_sale.utils');

    const RetailProductItem = (ProductItem) =>
        class extends ProductItem {
            constructor() {
                super(...arguments);
                this.state = useState({
                    refresh: 'waiting',
                });
            }

            _syncProduct(products) {
                let willRender = false
                if (products.length == 1 && (products[0]['write_date'] != this.props.product.write_date)) {
                    this.env.pos.product_model.loaded(this.env.pos, products)
                    this.env.pos.indexed_db.write('product.product', products);
                    this.props.product = this.env.pos.db.get_product_by_id(this.props.product.id)
                    willRender = true
                }
                if (products.length == 0) {
                    this.env.pos.indexed_db.unlink('product.product', this.props.product);
                    this.props.product['removed'] = true
                    this.env.pos.removeProductHasDeletedOutOfCart(this.props.product.id);
                    willRender = true
                }
                if (willRender) {
                    this.render()
                }
            }

            get imageUrl() {
                const product = this.props.product;
                return 'data:image/png;base64, ' + this.env.pos.image_by_product_id[product.id]
            }

            async _autoSyncBackend() {
                if (!this.env.pos.config.sync_products_realtime) {
                    return true
                }
                const self = this
                if (this.state.refresh != 'connecting') {
                    this.env.pos.set_synch('connecting', '')
                    this.state.refresh = 'connecting'
                    let products = await this.env.pos.getDatasByModel('product.product', [['id', '=', this.props.product.id]])
                    if (products != null) {
                        this._syncProduct(products)
                        this.env.pos.set_synch('connected', '')
                        setTimeout(() => {
                            self.state.refresh = 'done'
                        }, 1000)
                    } else {
                        this.env.pos.set_synch('disconnected', this.env._t('Offline Mode'))
                        setTimeout(() => {
                            self.state.refresh = 'error'
                        }, 1000)
                    }
                }

            }

            mounted() {
                const self = this
                super.mounted();
                if (this.env.pos.config.sync_products_realtime) {
                    this._autoSyncBackend()
                }
                posbus.on('reload.product.item', this, this._syncDirectBackendProduct)
            }

            willUnmount() {
                super.willUnmount();
                posbus.off('reload.product.item', this, null)
            }

            _syncDirectBackendProduct(product_id) {
                if (product_id == this.props.product.id) {
                    this._autoSyncBackend()
                }
            }

            _onMouseEnter(event) {
                this._autoSyncBackend()
            }

            get disableSale() {
                if (this.props.product['removed'] || !this.props.product.sale_ok || (this.env.pos.config.hide_product_when_outof_stock && !this.env.pos.config.allow_order_out_of_stock && this.props.product.type == 'product' && this.props.product.qty_available <= 0) || !this.props.product.available_in_pos) {
                    console.warn('not allow display: ' + this.props.product.display_name)
                    return true
                } else {
                    return false
                }
            }

            get price() {
                let price = 0;
                if (this.env.pos.config.display_sale_price_within_tax) {
                    price = this.props.product.get_price_with_tax(this.pricelist, 1)
                } else {
                    price = this.props.product.get_price(this.pricelist, 1)
                }
                const formattedUnitPrice = this.env.pos.format_currency(
                    price,
                    'Product Price'
                );
                if (this.props.product.to_weight) {
                    return `${formattedUnitPrice}/${
                        this.env.pos.units_by_id[this.props.product.uom_id[0]].name
                    }`;
                } else {
                    return formattedUnitPrice;
                }
            }

            async editProduct() {
                let {confirmed, payload: results} = await this.showPopup('PopUpCreateProduct', {
                    title: this.env._t('Edit ') + this.props.product.display_name,
                    product: this.props.product
                })
                if (confirmed && results) {
                    let value = {
                        name: results.name,
                        list_price: parseFloat(results.list_price),
                        default_code: results.default_code,
                        barcode: results.barcode,
                        standard_price: parseFloat(results.standard_price),
                        type: results.type,
                        available_in_pos: true
                    }
                    if (results.pos_categ_id != 'null') {
                        value['pos_categ_id'] = parseInt(results['pos_categ_id'])
                    }
                    if (results.product_brand_id != 'null') {
                        value['product_brand_id'] = parseInt(results['product_brand_id'])
                    } else {
                        value['product_brand_id'] = null
                    }
                    if (results.image_1920) {
                        value['image_1920'] = results.image_1920.split(',')[1];
                    }
                    await this.rpc({
                        model: 'product.product',
                        method: 'write',
                        args: [[this.props.product.id], value]
                    })
                    this._autoSyncBackend()
                    this.env.pos.alert_message({
                        title: this.env._t('Update Successfully'),
                        body: this.props.product.display_name + ' has updated ! When finish all update, please reload POS Screen for update new Datas'
                    })
                }
            }

            async archiveProduct() {
                let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Warning !!!'),
                    body: this.env._t('Are you sure want Archive Product Name: ') + this.props.product.display_name + this.env._t(' ?')
                })
                if (confirmed) {
                    await this.rpc({
                        model: 'product.product',
                        method: 'write',
                        args: [[this.props.product.id], {
                            available_in_pos: false,
                        }],
                        context: {}
                    })
                    this.env.pos.alert_message({
                        title: this.env._t('Archived Successfully !'),
                        body: this.props.product.display_name + ' has Archived and Remove out POS Screen, if you need active back, contact your Products Admin and set [Available In POS] back !'
                    })
                    this._autoSyncBackend()
                }
            }

            async addBarcode() {
                let newBarcode = await this.rpc({ // todo: template rpc
                    model: 'product.product',
                    method: 'add_barcode',
                    args: [[this.props.product.id]]
                })
                if (newBarcode) {
                    this.props.product['barcode'] = newBarcode
                    this.printBarcode()
                    this._autoSyncBackend()
                }
            }

            async printBarcode() {
                await this.env.pos.do_action('product.report_product_product_barcode', {
                    additional_context: {
                        active_id: this.props.product.id,
                        active_ids: [this.props.product.id],
                    }
                }, {
                    shadow: true,
                    timeout: 6500
                });
                if (this.env.pos.config.proxy_ip && this.env.pos.config.iface_print_via_proxy) {
                    const reportXML = qweb.render('ProductBarcodeLabel', {
                        product: this.props.product
                    });
                    await this.env.pos.proxy.printer.printXmlReceipt(reportXML);
                }
            }

            async doUpdateOnHand() {
                const product = this.props.product
                let stock_location_ids = this.env.pos.get_all_source_locations();
                let stock_datas = await this.env.pos.getStockDatasByLocationIds([product.id], stock_location_ids).then(function (datas) {
                    return datas
                });
                if (stock_datas) {
                    let items = [];
                    let withLot = false
                    if (product.tracking == 'lot') {
                        withLot = true
                    }
                    if (!withLot) {
                        for (let location_id in stock_datas) {
                            let location = this.env.pos.stock_location_by_id[location_id];
                            if (location) {
                                items.push({
                                    id: location.id,
                                    item: location,
                                    location_id: location.id,
                                    quantity: stock_datas[location_id][product.id]
                                })
                            }
                        }
                    } else {
                        let stockQuants = await this.rpc({
                            model: 'stock.quant',
                            method: 'search_read',
                            domain: [['product_id', '=', product.id], ['location_id', 'in', stock_location_ids]],
                            fields: [],
                            context: {
                                limit: 1
                            }
                        })
                        if (stockQuants) {
                            items = stockQuants.map((q) => ({
                                id: q.id,
                                item: q,
                                lot_id: q.lot_id[0],
                                lot_name: q.lot_id[1],
                                location_id: q.location_id[0],
                                location_name: q.location_id[1],
                                quantity: q.quantity
                            }));
                        }
                    }
                    if (items.length) {
                        let {confirmed, payload: result} = await this.showPopup('UpdateStockOnHand', {
                            title: this.env._t('Summary Stock on Hand (Available - Reserved) each Stock Location of [ ') + product.display_name + ' ]',
                            withLot: withLot,
                            array: items,
                        })
                        if (confirmed) {
                            const newStockArray = result.newArray

                            for (let i = 0; i < newStockArray.length; i++) {
                                let newStock = newStockArray[i];
                                if (!withLot) {
                                    await this.rpc({
                                        model: 'stock.location',
                                        method: 'pos_update_stock_on_hand_by_location_id',
                                        args: [newStock['location_id'], {
                                            product_id: product.id,
                                            product_tmpl_id: product.product_tmpl_id,
                                            quantity: parseFloat(newStock['quantity']),
                                            location_id: newStock['location_id']
                                        }],
                                        context: {}
                                    }, {
                                        shadow: true,
                                        timeout: 65000
                                    })
                                } else {
                                    await this.rpc({
                                        model: 'stock.quant',
                                        method: 'write',
                                        args: [newStock['id'], {
                                            quantity: parseFloat(newStock['quantity']),
                                        }],
                                        context: {}
                                    }, {
                                        shadow: true,
                                        timeout: 65000
                                    })
                                }
                            }
                            this.env.pos.trigger('reload.quantity.available')
                            this.env.pos.alert_message({
                                title: product.display_name,
                                body: this.env._t('Successfully update stock on hand'),
                                color: 'success'
                            })
                            return this.doUpdateOnHand(product)
                        }
                    } else {
                        return this.env.pos.alert_message({
                            title: this.env._t('Warning'),
                            body: product.display_name + this.env._t(' not found stock on hand !!!')
                        })
                    }
                }
            }
        }
    Registries.Component.extend(ProductItem, RetailProductItem);

    return ProductItem;
});
