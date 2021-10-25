odoo.define('pos_retail.SyncNotification', function (require) {
    'use strict';

    const SyncNotification = require('point_of_sale.SyncNotification');
    const Registries = require('point_of_sale.Registries');
    const Session = require('web.Session');

    const RetailSyncNotification = (SyncNotification) =>
        class extends SyncNotification {
            constructor() {
                super(...arguments);
            }

            mounted() {
                super.mounted();
                this.automaticPushOrderToBackEnd()
            }

            async automaticPushOrderToBackEnd() {
                const self = this;
                const ordersInCached = this.env.pos.db.get_orders();
                if (ordersInCached && ordersInCached.length > 0) {
                    console.log('[automaticPushOrderToBackEnd] auto running')
                    await this.env.pos.push_orders(null, {show_error: true}).then(function (order_ids) {
                        setTimeout(_.bind(self.automaticPushOrderToBackEnd, self), 6500);
                        console.log('[automaticPushOrderToBackEnd] saved new order id: ' + order_ids[0])
                    }, function (err) {
                        setTimeout(_.bind(self.automaticPushOrderToBackEnd, self), 6500);
                    });
                } else {
                    setTimeout(_.bind(self.automaticPushOrderToBackEnd, self), 3000);
                }
            }

            async onClick() {
                super.onClick();
                const serverOrigin = this.env.pos.session.origin;
                const connection = new Session(void 0, serverOrigin, {
                    use_cors: true
                });
                const pingServer = await connection.rpc('/pos/passing/login', {}).then(function (result) {
                    return result
                }, function (error) {
                    return false;
                })
                if (!pingServer) {
                    await this.showPopup('OfflineErrorPopup', {
                        title: this.env._t('Offline'),
                        body: this.env._t('Your Internet or Odoo Server Offline'),
                    });
                    return true;
                } else {
                    this.env.pos.alert_message({
                        title: this.env._t('Odoo Server Online'),
                        body: this.env._t('Server still working online mode'),
                        timer: 3000,
                    })
                }
            }
        }
    Registries.Component.extend(SyncNotification, RetailSyncNotification);

    return RetailSyncNotification;
});
