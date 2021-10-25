odoo.define('pos_retail.PopUpUpdateTheme', function (require) {
    'use strict';

    const {useState, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const {useExternalListener} = owl.hooks;

    class PopUpUpdateTheme extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {
                background: this.env.pos.config.background,
                price_tag_color: this.env.pos.config.price_tag_color,
                payment_screen_background: this.env.pos.config.payment_screen_background,
                product_screen_background: this.env.pos.config.product_screen_background,
                cart_box_style: this.env.pos.config.cart_box_style,
                product_width: this.env.pos.config.product_width,
                cart_width: this.env.pos.config.cart_width,
                cart_background: this.env.pos.config.cart_background,
                product_view: this.env.pos.config.product_view
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
            if (event.target.name == 'cart_width' && (event.target.value >= 100 || event.target.value <=0)) {
                event.target.value = 50
            }
            this.env.pos.config[event.target.name] = this.changes[event.target.name]
            this.env.session.config[event.target.name] = this.changes[event.target.name]
            this.env.qweb.forceUpdate();
            this.rpc({
                model: 'pos.config',
                method: 'write',
                args: [[this.env.pos.config.id], this.changes],
            }, {shadow: true, timeout: 7500})
        }


        getPayload() {
            return this.changes
        }
    }

    PopUpUpdateTheme.template = 'PopUpUpdateTheme';
    PopUpUpdateTheme.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpUpdateTheme);

    return PopUpUpdateTheme
});
