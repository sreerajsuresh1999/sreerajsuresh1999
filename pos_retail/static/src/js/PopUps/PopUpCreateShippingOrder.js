odoo.define('pos_retail.PopUpCreateShippingOrder', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const {useExternalListener} = owl.hooks;
    const contexts = require('point_of_sale.PosContext');
    var core = require('web.core');
    var _t = core._t;

    class PopUpCreateShippingOrder extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            let order = this.props.order;
            let client = this.props.client;
            this.state = useState({
                order: order,
            });
            this.changes = {
                name: order.delivery_name || client.name,
                signature: order.signature || '',
                note: order.get_note() || '',
                delivery_address: order.delivery_address || '',
                delivery_date: order.delivery_date || '',
                delivery_phone: order.delivery_phone || '',
                new_shipping_address: order.new_shipping_address || false,
            }
            this.orderUiState = useContext(contexts.orderManagement);
            useExternalListener(window, 'keyup', this._keyUp);
        }

        _keyUp(event) {
            if (event.key == 'Enter') {
                this.confirm()
            }
        }

        mounted() {
            var self = this;
            $(this.el).find('.datetimepicker').datetimepicker({
                format: 'YYYY-MM-DD HH:mm:00',
                icons: {
                    time: "fa fa-clock-o",
                    date: "fa fa-calendar",
                    up: "fa fa-chevron-up",
                    down: "fa fa-chevron-down",
                    previous: 'fa fa-chevron-left',
                    next: 'fa fa-chevron-right',
                    today: 'fa fa-screenshot',
                    clear: 'fa fa-trash',
                    close: 'fa fa-remove'
                },
            }).on("dp.change", function (event) {
                self.OnChange(event)
            });
            $(this.el).find(".signature").jSignature();
            this.signed = false;
            $(this.el).find(".signature").bind('change', function (e) {
                self.signed = true;
                self.verifyChanges();
            });
        }

        OnChange(event) {
            let target_name = event.target.name;
            if (event.target.name == 'new_shipping_address') {
                this.changes[event.target.name] = event.target.checked;
            } else {
                this.changes[event.target.name] = event.target.value;
            }
            this.verifyChanges()
        }

        verifyChanges() {
            let changes = this.changes;
            if (changes.name == '') {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = _t('Customer (Name/Street and Mobile) is required');
                this.env.pos.wrongInput(this.el, 'input[name="name"]');
                return;
            } else {
                this.orderUiState.isSuccessful = true;
            }
            if (changes.delivery_address == '' || changes.delivery_date == '' || changes.delivery_phone == '') {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = _t('Delivery (Address/Date and Phone) is required');
                this.env.pos.wrongInput(this.el, 'input[name="delivery_address"]');
                this.env.pos.wrongInput(this.el, 'input[name="delivery_date"]');
                this.env.pos.wrongInput(this.el, 'input[name="delivery_phone"]');
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.env.pos.passedInput(this.el, 'input[name="delivery_address"]');
                this.env.pos.passedInput(this.el, 'input[name="delivery_date"]');
                this.env.pos.passedInput(this.el, 'input[name="delivery_phone"]');
            }
            var sign_datas = $(this.el).find(".signature").jSignature("getData", "image");
            if (sign_datas && sign_datas[1] && this.signed) {
                changes['signature'] = sign_datas[1];
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = _t('Signature succeed')
            } else {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = _t('Please Signature');
                return;
            }
        }

        getPayload() {
            this.verifyChanges();
            if (this.orderUiState.isSuccessful) {
                return {
                    values: this.changes
                };
            } else {
                return {
                    values: this.changes,
                    error: this.orderUiState.hasNotice
                };
            }

        }
    }

    PopUpCreateShippingOrder.template = 'PopUpCreateShippingOrder';
    PopUpCreateShippingOrder.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpCreateShippingOrder);

    return PopUpCreateShippingOrder
});
