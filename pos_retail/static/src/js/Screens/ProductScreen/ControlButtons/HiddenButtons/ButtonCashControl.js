odoo.define('pos_retail.ButtonCashControl', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const field_utils = require('web.field_utils');

    class ButtonCashControl extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
        }

        get getCount() {
            return this.count;
        }

        get selectedOrderline() {
            return this.env.pos.get_order().get_selected_orderline();
        }

        async onClick() {
            let self = this;
            let sessions = await this.rpc({
                model: 'pos.session',
                method: 'search_read',
                args: [[['id', '=', this.env.pos.pos_session.id]]]
            }).then(function (sessions) {
                return sessions
            }, function (err) {
                return self.env.pos.query_backend_fail(err)
            });
            if (sessions.length) {
                const sessionSelected = sessions[0]
                let startedAt = field_utils.parse.datetime(sessionSelected.start_at);
                sessionSelected.start_at = field_utils.format.datetime(startedAt);
                let {confirmed, payload: values} = await this.showPopup('CashSession', {
                    title: this.env._t('Management Cash In/Out of Your Session'),
                    session: sessionSelected
                })
                if (confirmed) {
                    let action = values.action;
                    if ((action == 'putMoneyIn' || action == 'takeMoneyOut') && values.value.amount != 0) {
                        await this.rpc({
                            model: 'cash.box.out',
                            method: 'cash_input_from_pos',
                            args: [0, values.value],
                        }).then(function (result) {
                            return result
                        }, function (err) {
                            return self.env.pos.query_backend_fail(err);
                        })
                        this.onClick();
                    }
                    if (action == 'setClosingBalance' && values.value.length > 0) {
                        await this.rpc({
                            model: 'account.bank.statement.cashbox',
                            method: 'validate_from_ui',
                            args: [0, this.env.pos.pos_session.id, 'end', values.value],
                        }).then(function (result) {
                            return result
                        }, function (err) {
                            return self.env.pos.query_backend_fail(err);
                        })
                        this.onClick();
                    }
                }
            }
        }
    }

    ButtonCashControl.template = 'ButtonCashControl';

    ProductScreen.addControlButton({
        component: ButtonCashControl,
        condition: function () {
            return this.env.pos.config.cash_control && this.env.pos.config.management_session;
        },
    });

    Registries.Component.add(ButtonCashControl);

    return ButtonCashControl;
});
