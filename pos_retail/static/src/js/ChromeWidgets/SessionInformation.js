odoo.define('point_of_sale.SessionInformation', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const field_utils = require('web.field_utils');
    const {useState} = owl;
    const {posbus} = require('point_of_sale.utils');

    class SessionInformation extends PosComponent {
        constructor() {
            super(...arguments);
            let openedAt = field_utils.parse.datetime(this.env.pos.pos_session.opened_at);
            openedAt = field_utils.format.datetime(openedAt);
            this.state = useState({
                'session': this.env.pos.pos_session.name,
                'shop': this.env.pos.config.name,
                'opened_at': openedAt,
                'order_count': this.env.pos.pos_session.order_count,
                'total_payments_amount': this.env.pos.pos_session.total_payments_amount,
            });
        }

        mounted() {
            posbus.on('reload.session.information.widget', this, this.automaticReloadPosSession);
        }

        willUnmount() {
            posbus.off('reload.session.information.widget', this, null);
        }

        async automaticReloadPosSession(options) {
            this.state['order_count'] += 1
            this.state['total_payments_amount'] += options['amount_total']
            this.render()
        }

        async onClick() {
            let sessionModel = _.find(this.env.pos.models, function (model) {
                return model.model == 'pos.session' && model['core'];
            });
            if (sessionModel) {
                sessionModel['domain'] = [['id', '=', this.env.pos.pos_session['id']]]
                await this.env.pos.load_server_data_by_model(sessionModel);
                this.state['order_count'] = this.env.pos.pos_session.order_count
                this.state['total_payments_amount'] = this.env.pos.pos_session.total_payments_amount
                this.render()
            }
        }
    }

    SessionInformation.template = 'SessionInformation';

    Registries.Component.add(SessionInformation);

    return SessionInformation;
});
