odoo.define('pos_retail.PopUpCreateSaleOrder', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const {useExternalListener} = owl.hooks;
    const contexts = require('point_of_sale.PosContext');
    var core = require('web.core');
    var _t = core._t;

    class PopUpCreateSaleOrder extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            let order = this.props.order;
            let client = order.get_client();
            let table = order.table
            let reserve_table_id = null
            if (table) {
                reserve_table_id = order.table.id
            }
            this.state = useState({
                order: order,
            });
            this.changes = {
                delivery_phone: client.mobile || client.phone,
                delivery_address: order.delivery_address || client.address,
                delivery_date: this.props.delivery_date || order.delivery_date,
                note: order.note,
                signature: null,
                payment_partial_amount: 0,
                payment_partial_method_id: this.env.pos.normal_payment_methods[0].id,
                pricelist_id: order.pricelist.id,
                sale_order_auto_confirm: this.env.pos.config.sale_order_auto_confirm,
                sale_order_auto_invoice: this.env.pos.config.sale_order_auto_invoice,
                sale_order_auto_delivery: this.env.pos.config.sale_order_auto_delivery,
                reserve_from: order.reserve_from,
                reserve_to: order.reserve_to,
                reserve_table_id: reserve_table_id,
                reserve_mobile: '',
                reserve_no_of_guests: order.get_guest()
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
            $(this.el).find(".signature").jSignature();
            this.signed = false;
            $(this.el).find(".signature").bind('change', function (e) {
                self.signed = true;
                self.verifyChanges();
            });
        }

        OnChange(event) {
            let target_name = event.target.name;
            if (event.target.type == 'checkbox') {
                this.changes[event.target.name] = event.target.checked;
            } else {
                this.changes[event.target.name] = event.target.value;
            }
            if (target_name == 'payment_partial_amount') {
                this.changes[event.target.name] = parseFloat(this.changes[event.target.name]);
            }
            this.verifyChanges()
        }

        verifyChanges() {
            let changes = this.changes;
            if (changes.delivery_phone == '') {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = this.env._t('Phone is required')
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = this.env._t('Phone is valid')
            }
            if (changes.delivery_address == '') {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = this.env._t('Phone is required')
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = this.env._t('Phone is valid');
            }
            if (changes.delivery_date == '') {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = this.env._t('Delivery Date is required');
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = this.env._t('Delivery Date is valid')
            }
            if (changes.payment_partial_amount < 0) {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = this.env._t('Partial Amount required bigger than or equal 0');
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = this.env._t('Partial Amount is valid')
            }
            if ((changes.reserve_from && !changes.reserve_to) || (changes.reserve_to && !changes.reserve_from)) {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = this.env._t('If you need create Reserve Order, Reserve from and to is required !!!');
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = this.env._t('Reserve from and to is valid')
            }
            var sign_datas = $(this.el).find(".signature").jSignature("getData", "image");
            if (this.env.pos.config.sale_order_required_signature) {
                if (sign_datas && sign_datas[1] && this.signed) {
                    changes['signature'] = sign_datas[1];
                    this.orderUiState.isSuccessful = true;
                    this.orderUiState.hasNotice = this.env._t('Signature succeed')
                } else {
                    this.orderUiState.isSuccessful = false;
                    this.orderUiState.hasNotice = this.env._t('Please Signature');
                    return;
                }
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
                    values: {},
                    error: this.orderUiState.hasNotice
                };
            }
        }
    }

    owl.config.mode = "dev";

    PopUpCreateSaleOrder.template = 'PopUpCreateSaleOrder';
    PopUpCreateSaleOrder.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpCreateSaleOrder);

    return PopUpCreateSaleOrder
});
