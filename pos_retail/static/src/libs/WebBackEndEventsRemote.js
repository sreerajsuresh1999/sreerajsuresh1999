odoo.define('pos_retail.WebBackEndEventsRemote', function (require) {
    "use strict";

    const  WebClient = require('web.WebClient');
    const  core = require('web.core');
    const  _t = core._t;
    const  rpc = require('web.rpc');

    WebClient.include({
        remove_indexed_db: function (dbName) {
            for (let i = 0; i <= 100; i++) {
                indexedDB.deleteDatabase(dbName + '_' + i);
            }
            this.do_notify(_t('Alert'),
                _t('Admin drop pos database:' + dbName));
        },
        show_application: function () {
            let self = this;
            this.call('bus_service', 'onNotification', this, function (notifications) {
                _.each(notifications, (function (notification) {
                    if (notification[0][1] === 'pos.remote_sessions') {
                        let data = JSON.parse(notification[1]);
                        if (data['message']) {
                            self.do_notify(_t('Alert'),
                                _t(data['message']));
                        }
                        if (data['open_session']) {
                            window.open('/pos/web?config_id=' + data['config_id'], '_self');
                        }
                        if (data['remove_cache']) {
                            self.remove_indexed_db(data.database);
                        }
                        if (data['validate_and_post_entries']) {
                            // self.do_notify(_t('Alert'),
                            //     _t('Your pos session just validated and post entries by your manager'));
                            // return new Promise(function (resolve, reject) {
                            //     return rpc.query({
                            //         model: 'pos.config',
                            //         method: 'validate_and_post_entries_session',
                            //         args: [[data['config_id']]],
                            //         context: {}
                            //     }).then(function () {
                            //         resolve()
                            //     }, function (err) {
                            //         reject()
                            //     })
                            // })
                        }
                    }
                }).bind(this));
            });
            return this._super.apply(this, arguments);
        },
    });
});
