odoo.define('pos_retail.KitchenProcessingTimes', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class KitchenProcessingTimes extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = {
                startTime: this.props.order.request_time || new Date().getTime(),
            };
        }

        get warningWaitingTime() {
            var diff = new Date().getTime() - this.state.startTime;
            var msec = diff;
            var hh = `0${Math.floor(msec / 1000 / 60 / 60)}`;
            msec -= hh * 1000 * 60 * 60;
            var mm = `0${Math.floor(msec / 1000 / 60)}`;
            if ((Math.floor(msec / 1000 / 60) >= this.env.pos.config.period_minutes_warning)) {
                return true
            } else {
                return false
            }

        }

        get getProcessingTime() {
            let self = this;
            var diff = new Date().getTime() - this.state.startTime;
            var msec = diff;
            var hh = `0${Math.floor(msec / 1000 / 60 / 60)}`;
            msec -= hh * 1000 * 60 * 60;
            var mm = `0${Math.floor(msec / 1000 / 60)}`;
            msec -= mm * 1000 * 60;
            var ss = `0${Math.floor(msec / 1000)}`;
            msec -= ss * 1000;
            setTimeout(function () {
                self.render()
            }, 1000)
            return hh.slice(-2) + ":" + mm.slice(-2) + ":" + ss.slice(-2);
        }
    }

    KitchenProcessingTimes.template = 'KitchenProcessingTimes';

    Registries.Component.add(KitchenProcessingTimes);

    return KitchenProcessingTimes;
});
