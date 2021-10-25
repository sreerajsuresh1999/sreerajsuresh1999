odoo.define('point_of_sale.SyncBetweenSessionsNotification', function (require) {
    'use strict';

    const {useState} = owl;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class SyncBetweenSessionsNotification extends PosComponent {
        constructor() {
            super(...arguments);
            let synch = this.env.pos.get('syncStatus');
            if (!synch) {
                synch = {
                    status: 'disconnected',
                    msg: ''
                }
            }
            this.state = useState({status: synch.status, msg: synch.pending});
        }

        mounted() {
            this.env.pos.on(
                'change:syncStatus',
                (pos, synch) => {
                    this.state.status = synch.status;
                    this.state.msg = synch.pending;
                },
                this
            );
        }

        willUnmount() {
            this.env.pos.on('change:syncStatus', null, this);
        }

        async onClick() {
            if (!this.env.pos.config.sync_multi_session_manual_stop) {
                return this.env.pos.alert_message({
                    title: this.env._t('Alert'),
                    body: this.env._t('Sync always running automatic, you can not stop it. If you need manual Stop, please checking to field [Sync Can manual stop by Users]')
                })
            }
            this.env.pos.config.sync_multi_session = !this.env.pos.config.sync_multi_session
            if (this.env.pos.config.sync_multi_session) {
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert'),
                    body: this.env._t('Sync Working back'),
                    disableCancelButton: true,
                })
            } else {
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert'),
                    body: this.env._t('Sync Pending'),
                    disableCancelButton: true,
                })
            }
        }
    }

    SyncBetweenSessionsNotification.template = 'SyncBetweenSessionsNotification';

    Registries.Component.add(SyncBetweenSessionsNotification);

    return SyncBetweenSessionsNotification;
});
