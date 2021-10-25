"use strict";
odoo.define('pos_retail.removeSessions', function (require) {

    const  models = require('point_of_sale.models');
    const  exports = {};
    const  Backbone = window.Backbone;
    const  bus = require('pos_retail.core_bus');
    const  rpc = require('web.rpc');
    const  core = require('web.core');
    const  _t = core._t;
    const BigData = require('pos_retail.big_data');

    exports.posRemoveSessions = Backbone.Model.extend({
        initialize: function (pos) {
            this.pos = pos;
        },
        start: function () {
            this.bus = bus.bus;
            this.bus.on("notification", this, this.on_notification);
            this.bus.start_polling();
        },

        raiseMessage(message) {
            this.pos.alert_message({
                title: _t('Alert'),
                body: _t(message)
            })
        },

        on_notification: function (notifications) {
            if (notifications && notifications[0] && notifications[0][1]) {
                for (let i = 0; i < notifications.length; i++) {
                    let channel = notifications[i][0][1];
                    if (channel == 'pos.remote_sessions') {
                        let value = JSON.parse(notifications[i][1]);
                        let session_id = value['session_id']
                        if (session_id == this.pos.pos_session['id']) {
                            if (value['remove_cache']) {
                                if (value.message) this.raiseMessage(value.message)
                                this.pos.remove_indexed_db()
                                this.pos.reload_pos();
                            }
                            if (value['reload_session']) {
                                console.log(_t('Manager remote : Reload your Session'))
                                if (value.message) this.raiseMessage(value.message)
                                this.pos.reload_pos()
                            }
                            if (value['validate_and_post_entries']) {
                                console.log(_t('Manager remote : Validate and Posting and Close your Session Now'))
                                if (value.message) this.raiseMessage(value.message)
                                this.pos.chrome.closingSession();
                                this.pos.close_pos();
                            }
                            if ((value['close_session'] && value['start_time'] && value['start_time'] != this.pos.start_time) || (value['force_close_session'])) {
                                console.log(_t('Manager remote : close your Session'))
                                if (value.message) this.raiseMessage(value.message)
                                this.pos.close_pos()
                            }
                            // if (value['lock_session']) {
                            //     console.log(_t('Manager remote : Locked your Session'))
                            //     this.pos.gui.chrome.widget['lock_session_widget'].el.click();
                            // }
                            // if (value['unlock_session']) {
                            //     console.log(_t('Manager remote : Unlocked your Session'))
                            //     rpc.query({
                            //         model: 'pos.session',
                            //         method: 'lock_session',
                            //         args: [[parseInt(this.pos.config.id)], {
                            //             lock_state: 'unlock'
                            //         }]
                            //     });
                            //     return this.pos.gui.close_popup();
                            // }
                            break
                        }
                    }
                }
            }
        }
    });

    let _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        load_server_data: function () {
            let self = this;
            console.log('load_server_data 2')
            return _super_PosModel.load_server_data.apply(this, arguments).then(function () {
                self.pos_remote_session = new exports.posRemoveSessions(self);
                self.pos_remote_session.start();
            })
        }
    })

});
