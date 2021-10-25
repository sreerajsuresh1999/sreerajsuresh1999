odoo.define('pos_retail.PopUpCreateProduct', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const {useExternalListener} = owl.hooks;

    class PopUpCreateProduct extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {
                error: null,
                type: 'consu',
                valid: null,
                barcode: this.props.barcode,
                name: '',
                list_price: '',
                default_code: '',
                standard_price: '',
                product_brand_id: null
            }
            if (this.props.product) {
                this.changes['name'] = this.props.product.name
                this.changes['list_price'] = this.props.product.lst_price
                this.changes['default_code'] = this.props.product.default_code
                this.changes['barcode'] = this.props.product.barcode
                this.changes['standard_price'] = this.props.product.standard_price
                this.changes['type'] = this.props.product.type
                if (this.props.product_brand_id) {
                    this.changes['product_brand_id'] = this.props.product_brand_id[0]
                }
                if (this.props.product.pos_categ_id) {
                    this.changes['pos_categ_id'] = this.props.product.pos_categ_id[0]
                }
            }
            this.state = useState(this.changes);
            this.orderUiState = useContext(contexts.orderManagement);
            useExternalListener(window, 'keyup', this._keyUp);
        }

        _keyUp(event) {
            if (event.key == 'Enter') {
                this.confirm()
            }
        }

        async OnChange(event) {
            const self = this;
            if (event.target.type == 'checkbox') {
                this.changes[event.target.name] = event.target.checked;
            }
            if (event.target.type == 'file') {
                await this.env.pos.chrome.loadImageFile(event.target.files[0], function (res) {
                    if (res) {
                        var contents = $(self.el);
                        contents.scrollTop(0);
                        contents.find('.client-picture img, .client-picture .fa').remove();
                        contents.find('.client-picture').append("<img src='" + res + "'>");
                        contents.find('.detail.picture').remove();
                        self.changes['image_1920'] = res;
                    }
                });
            }
            if (!['checkbox', 'file'].includes(event.target.type)) {
                this.changes[event.target.name] = event.target.value;
            }
            if (!this.changes['name']) {
                this.state.error = this.env._t('Name is required')
                return false
            } else {
                this.state.valid = this.env._t('Ready to Create')
                this.state.error = null
            }
            if (!this.changes['list_price']) {
                this.state.error = this.env._t('List Price is required')
                return false
            } else {
                this.state.valid = this.env._t('Ready to Create')
                this.state.error = null
            }
            this.render()
        }


        getPayload() {
            return this.changes
        }
    }

    PopUpCreateProduct.template = 'PopUpCreateProduct';
    PopUpCreateProduct.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpCreateProduct);

    return PopUpCreateProduct
});
