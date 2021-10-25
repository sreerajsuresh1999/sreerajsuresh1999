odoo.define('pos_retail.PopUpSelectionBox', function (require) {
    'use strict';

    const {useState} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const PosComponent = require('point_of_sale.PosComponent');
    const {useExternalListener} = owl.hooks;

    class PopUpSelectionBox extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this._id = 0;
            this.items = this.props.items;
            this.items.forEach(function (i) {
                if (!i.selected) i.selected = false;
            })
            this.state = useState({
                items: this.items,
                onlySelectOne: this.props.onlySelectOne || false
            });
            useListener('click-item', this.onClickItem);
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
                await this.confirm()
            }
            const key = parseInt(event.key)
            if ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].includes(key)) {
                let itemSelected = this.items[key]
                if (itemSelected) {
                    let event = {
                        detail: {
                            item: itemSelected
                        }
                    }
                    await this.onClickItem(event)
                }

            }
        }

        async onClickItem(event) {
            let item = event.detail.item;
            item.selected = !item.selected;
            this.state.items.forEach(function (i) {
                if (i.id == item.id) {
                    i.selected = item.selected;
                }
            })
            this.state.editModeProps = {
                items: this.state.items
            }
            if (this.state.onlySelectOne) {
                this.state.items.forEach(function (i) {
                    if (i.id != item.id) {
                        i.selected = false;
                    }
                })
                return await this.confirm()
            } else {
                this.render()
            }
        }

        get Items() {
            if (!this.state.editModeProps) {
                return this.items
            } else {
                return this.state.editModeProps.items
            }

        }

        async getPayload() {
            const results = {
                items: this.items
                    .filter((i) => i.selected)
            };
            return results
        }
    }

    PopUpSelectionBox.template = 'PopUpSelectionBox';
    PopUpSelectionBox.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };
    Registries.Component.add(PopUpSelectionBox);


    class Item extends PosComponent {
        onKeyup(event) {
            if (event.key === "Enter" && event.target.value.trim() !== '') {
                debugger
            }
        }
    }

    Item.template = 'Item';
    Registries.Component.add(Item);
    return Item;

    return PopUpSelectionBox
});
