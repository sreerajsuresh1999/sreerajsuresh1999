odoo.define('pos_retail.CashSession', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const {useListener} = require('web.custom_hooks');

    class CashSession extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {
                session: this.props.session
            }
            this.state = useState(this.change);
            this.orderUiState = useContext(contexts.orderManagement);
            this._initCashInOutReason();
        }

        async _initCashInOutReason() {
            let self = this;
            return await this.rpc({
                model: 'product.product',
                method: 'search_read',
                domain: [['id', 'in', this.env.pos.config.cash_inout_reason_ids]],
                fields: this.env.pos.product_model.fields
            }).then(function (cash_inout_products_reason) {
                self.env.pos.cash_inout_products_reason = cash_inout_products_reason
            }, function (err) {
                self.env.pos.cash_inout_products_reason = []
                return self.env.pos.query_backend_fail(err);
            });
        }

        OnChange(event) {
            if (event.target.type == 'checkbox') {
                this.changes[event.target.name] = event.target.checked;
            } else {
                this.changes[event.target.name] = event.target.value;
            }
            this.render()
        }


        getPayload() {
            return this.changes
        }

        async closeSession() {
            await this.env.pos.chrome._closePos()
        }

        async putMoneyIn() {
            let self = this;
            await this._initCashInOutReason()
            if (!this.env.pos.cash_inout_products_reason || this.env.pos.cash_inout_products_reason.length == 0) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('Your POS missed Cash In/Out Reason')
                })
            }
            let {confirmed, payload: value} = await this.showPopup('CashInOut', {
                title: this.env._t('Input Money In'),
                type: 'in',
                product_id: this.env.pos.cash_inout_products_reason[0].id,
                reason: this.env._t('Input Money In'),
                cash_inout_products_reason: this.env.pos.cash_inout_products_reason,
                amount: 0,
                session_id: this.env.pos.pos_session.id,
            })
            if (confirmed) {
                value.amount = parseFloat(value.amount);
                this.props.resolve({
                    confirmed: true, payload: {
                        action: 'putMoneyIn',
                        value: value
                    }
                });
            }
        }

        async takeMoneyOut() {
            let self = this;
            await this._initCashInOutReason()
            if (!this.env.pos.cash_inout_products_reason || this.env.pos.cash_inout_products_reason.length == 0) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('Your POS missed Cash In/Out Reason')
                })
            }
            let {confirmed, payload: value} = await this.showPopup('CashInOut', {
                title: this.env._t('Take Money Out'),
                type: 'out',
                product_id: this.env.pos.cash_inout_products_reason[0].id,
                reason: this.env._t('Take Money Out'),
                cash_inout_products_reason: this.env.pos.cash_inout_products_reason,
                amount: 0,
                session_id: this.env.pos.pos_session.id,
            })
            if (confirmed) {
                value.amount = parseFloat(value.amount);
                if (value.amount > 0) {
                    value.amount = -value.amount
                }
                this.props.resolve({
                    confirmed: true, payload: {
                        action: 'takeMoneyOut',
                        value: value
                    }
                });
            }
        }

        async setClosingBalance() {
            const coints = await this.rpc({
                model: 'pos.session',
                method: 'get_cashbox',
                args: [0, this.env.pos.pos_session.id, 'end'],
            })
            if (coints) {
                let {confirmed, payload: values} = await this.showPopup('CashBalance', {
                    title: this.env._t('Closing Cash Register, press Enter add more line'),
                    array: coints,
                });
                if (confirmed) {
                    let listCounts = values.newArray.map((item) => (
                        {
                            id: item.id,
                            coin_value: parseFloat(item.coin_value),
                            number: parseFloat(item.number)
                        }
                    ))
                    this.props.resolve({
                        confirmed: true, payload: {
                            action: 'setClosingBalance',
                            value: listCounts
                        }
                    });
                }
            }
        }
    }

    CashSession.template = 'CashSession';
    CashSession.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(CashSession);

    return CashSession
});
