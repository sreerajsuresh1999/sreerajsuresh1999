odoo.define('pos_retail.ErrorBarcodePopup', function (require) {
    'use strict';

    const ErrorBarcodePopup = require('point_of_sale.ErrorBarcodePopup');
    const Registries = require('point_of_sale.Registries');
    const {useExternalListener} = owl.hooks;

    const RetailErrorBarcodePopup = (ErrorBarcodePopup) =>
        class extends ErrorBarcodePopup {
            constructor() {
                super(...arguments);
                // useExternalListener(window, 'keyup', this._keyUp);
            }

            async createNewProduct() {
                const code = this.props.code;
                let {confirmed, payload: results} = await this.showPopup('PopUpCreateProduct', {
                    title: this.env._t('Create new Product'),
                    barcode: code
                })
                if (confirmed && results) {
                    let value = {
                        name: results.name,
                        list_price: results.list_price,
                        default_code: results.default_code,
                        barcode: results.barcode,
                        standard_price: results.standard_price,
                        type: results.type,
                        available_in_pos: true
                    }
                    if (results.pos_categ_id != 'null') {
                        value['pos_categ_id'] = results['pos_categ_id']
                    }
                    if (results.image_1920) {
                        value['image_1920'] = results.image_1920.split(',')[1];
                    }
                    const product_id = await this.rpc({
                        model: 'product.product',
                        method: 'create',
                        args: [value]
                    })
                    await this.env.pos.syncProductsPartners();
                    var product = this.env.pos.db.get_product_by_id(product_id);
                    this.env.pos.get_order().add_product(product, {
                        quantity: 1,
                        price: product['lst_price'],
                        merge: true
                    });

                }
            }
        }
    Registries.Component.extend(ErrorBarcodePopup, RetailErrorBarcodePopup);

    return RetailErrorBarcodePopup;
});
