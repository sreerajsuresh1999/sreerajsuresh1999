odoo.define('pos_retail.PopUpCreateMrpOrder', function (require) {
    'use strict';

    const {useState} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const {useExternalListener} = owl.hooks;

    class PopUpCreateMrpOrder extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this._id = 0;
            this.items = this.props.items;
            this.items.forEach(function (i) {
                if (!i.selected) i.selected = false;
                if (!i.quantity) {
                    i.quantity = i.product_qty;
                }
            })
            this.state = useState({
                items: this.items,
            });
            useExternalListener(window, 'keyup', this._keyUp);
        }

        _keyUp(event) {
            if (event.key == 'Enter') {
                this.confirm()
            }
        }

        onClickPlus(bomline) {
            this.props.items.forEach((item) => {
                if (item.id == bomline.id && item.quantity > 0) {
                    item.quantity += 1
                }
            })
            this.render()
        }

        onClickMinus(bomline) {
            this.props.items.forEach((item) => {
                if (item.id == bomline.id && item.quantity > 1) {
                    item.quantity -= 1
                }
            })
            this.render()
        }

        getPayload() {
            return {
                items: this.items
                    .filter((i) => i.quantity > 0)
            };
        }
    }

    PopUpCreateMrpOrder.template = 'PopUpCreateMrpOrder';
    PopUpCreateMrpOrder.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };
    Registries.Component.add(PopUpCreateMrpOrder);

    return PopUpCreateMrpOrder;
});
