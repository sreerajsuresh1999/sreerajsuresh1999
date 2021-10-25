odoo.define('pos_retail.HrCashierName', function (require) {
    'use strict';

    const CashierName = require('pos_hr.CashierName');
    const Registries = require('point_of_sale.Registries');

    const RetailCashierName = (CashierName) =>
        class extends CashierName {
            async selectCashier() {
                await super.selectCashier()
                const selectedCashier = this.env.pos.get_cashier();
                if (selectedCashier && this.env.pos.config.module_pos_hr && this.env.pos.config.multi_session) {
                    try {
                        let sessionValue = await this.rpc({
                            model: 'pos.session',
                            method: 'get_session_by_employee_id',
                            args: [[], selectedCashier.id, this.env.pos.config.id],
                        })
                        const sessionLogin = sessionValue['session']
                        this.env.pos.pos_session = sessionLogin
                        this.env.pos.login_number = sessionValue.login_number + 1
                        this.env.pos.db.save('pos_session_id', this.env.pos.pos_session.id);
                        const orders = this.env.pos.get('orders').models;
                        for (let i = 0; i < orders.length; i++) {
                            orders[i]['pos_session_id'] = sessionLogin['id']
                        }
                    } catch (error) {
                        if (error.message.code < 0) {
                            await this.showPopup('OfflineErrorPopup', {
                                title: this.env._t('Offline'),
                                body: this.env._t('Unable to save changes.'),
                            });
                        }
                    }
                }

            }
        }
    Registries.Component.extend(CashierName, RetailCashierName);

    return RetailCashierName;
});
