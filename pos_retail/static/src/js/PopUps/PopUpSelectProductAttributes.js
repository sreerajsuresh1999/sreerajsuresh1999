odoo.define('pos_retail.PopUpSelectProductAttributes', function (require) {
    'use strict';

    const {useState} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const PosComponent = require('point_of_sale.PosComponent');
    const {useExternalListener} = owl.hooks;

    class PopUpSelectProductAttributes extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this._id = 0;
            this.products = this.props.products;
            this.products.forEach(function (p) {
                p.selected = false;
            })
            this.products_selected = []
            this.attributes = this.props.attributes;
            this.attributes.forEach(function (att) {
                att.selected = false;
            })
            this.state = useState({
                products: this.products,
                attributes: this.attributes,
            });
            useListener('click-attribute', this.onClickAttribute);
            useListener('click-product', this.onClickProduct);
            useExternalListener(window, 'keyup', this._keyUp);
            this.env.pos.lockedUpdateOrderLines = true; // todo: we locked event keyboard when popup show, when this variable active, ProductScreen trigger method _updateSelectedOrderline wil return
        }

        mounted() {
            super.mounted();
            this.env.pos.lockedUpdateOrderLines = true; // todo: we locked event keyboard when popup show, when this variable active, ProductScreen trigger method _updateSelectedOrderline wil return
        }

        willUnmount() {
            super.willUnmount();
            const self = this;
            setTimeout(function () {
                self.env.pos.lockedUpdateOrderLines = false; // timeout 0.5 seconds unlock todo: we locked event keyboard when popup show, when this variable active, ProductScreen trigger method _updateSelectedOrderline wil return
            }, 500)
        }

        async _keyUp(event) {
            if (event.key == 'Enter') {
                this.props.resolve({
                    confirmed: true, payload: {
                        product_ids: this.products_selected
                    }
                });
                this.trigger('close-popup');
            }
            const key = parseInt(event.key)
            if ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].includes(key)) {
                let productSelected = this.products[key]
                if (productSelected) {
                    let event = {
                        detail: {
                            product: productSelected
                        }
                    }
                    this.onClickProduct(event)
                }
            }
        }

        onClickAttribute(event) {
            let attribute = event.detail.attribute;
            if (!attribute.selected) {
                attribute.selected = true
            } else {
                attribute.selected = false
            }
            this.state.attributes.forEach(function (st) {
                if (st.id == attribute.id) {
                    st.selected = attribute.selected;
                }
            })
            let products = this.products;
            var products_will_display = [];
            let attributes_selected_ids = this.state.attributes
                .filter((att) => att.selected)
                .map((att) => att.id)
            for (var i = 0; i < products.length; i++) {
                var product = products[i];
                if (attributes_selected_ids.length == 1) {
                    for (var j = 0; j < product.product_template_attribute_value_ids.length; j++) {
                        var attribute_product_id = product.product_template_attribute_value_ids[j];
                        if (attributes_selected_ids.indexOf(attribute_product_id) != -1) {
                            products_will_display.push(product);
                        }
                    }
                } else {
                    var temp = true
                    for (var j = 0; j < product.product_template_attribute_value_ids.length; j++) {
                        var attribute_product_id = product.product_template_attribute_value_ids[j];
                        if (attributes_selected_ids.indexOf(attribute_product_id) == -1) {
                            temp = false
                            break
                        }
                    }
                    if (temp) {
                        products_will_display.push(product);
                    }
                }
            }
            this.state.editModeProps = {
                attributes: this.state.attributes,
                products: products_will_display
            }
            this.render()
        }

        onClickProduct(event) {
            let product = event.detail.product;
            product.selected = !product.selected
            this.state.products.forEach(function (p) {
                if (p.id == product.id) {
                    p.selected = product.selected;
                }
            })
            this.state.editModeProps = {
                attributes: this.state.attributes,
                products: this.state.products
            }
            this.products.forEach(function (p) {
                if (p.id == product.id) {
                    p.selected = product.selected;
                }
            })
            if (product.selected) {
                this.products_selected.push(product.id)
            } else {
                this.products_selected = this.products_selected.filter(p_id => p_id != product.id)
            }
            this.render()
        }

        get Attributes() {
            if (this.state.editModeProps) {
                return this.state.editModeProps.attributes
            } else {
                return this.attributes
            }
        }

        get Products() {
            if (!this.state.editModeProps) {
                return this.products
            } else {
                return this.state.editModeProps.products
            }

        }

        async getPayload() {
            return {
                product_ids: this.products_selected
            };
        }
    }

    PopUpSelectProductAttributes.template = 'PopUpSelectProductAttributes';
    PopUpSelectProductAttributes.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };
    Registries.Component.add(PopUpSelectProductAttributes);


    class ProductAttribute extends PosComponent {
        onKeyup(event) {
            if (event.key === "Enter" && event.target.value.trim() !== '') {
                debugger
            }
        }

        get price() {
            let price = 0;
            if (!this.env.pos.config.display_sale_price_within_tax) {
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
    }

    ProductAttribute.template = 'ProductAttribute';
    Registries.Component.add(ProductAttribute);
    return ProductAttribute;

    return {
        PopUpSelectProductAttributes: PopUpSelectProductAttributes,
        ProductAttribute: ProductAttribute,
    };
});
